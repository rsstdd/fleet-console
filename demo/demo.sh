#!/usr/bin/env bash
# Guided demonstration driver for the fleet console.
#
# Follows the seven acts in the companion demonstration guide. The script starts
# the server, console, and simulator; injects the drop and server-outage scenarios;
# and prints fleet and health summaries between acts. Keep
# http://localhost:5173 visible throughout because the browser remains under the
# presenter's control.
#
# Usage:  ./demo/demo.sh
# Stop:   Ctrl-C at any pause; every child process is cleaned up on exit.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/demo/.logs"
SERVER_URL="http://127.0.0.1:8080"
WEB_URL="http://localhost:5173"
TENANT_URL="http://localhost:5174"

SERVER_PID=""
WEB_PID=""
TENANT_WEB_PID=""
SIM_PID=""

# ---------------------------------------------------------------- presentation --

# Color only when stdout is a terminal and NO_COLOR is unset; degrade to plain
# text otherwise so redirecting the run into a file stays readable.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RESET=$'\033[0m' BOLD=$'\033[1m' DIM=$'\033[2m'
  CYAN=$'\033[36m' GREEN=$'\033[32m' YELLOW=$'\033[33m'
  RED=$'\033[31m' MAGENTA=$'\033[35m'
  export DEMO_COLOR=1
else
  RESET='' BOLD='' DIM='' CYAN='' GREEN='' YELLOW='' RED='' MAGENTA=''
  export DEMO_COLOR=0
fi

RULE="══════════════════════════════════════════════════════════════════"

bold() { printf '%s\n' "${BOLD}$*${RESET}"; }
dim() { printf '%s\n' "${DIM}$*${RESET}"; }

# Act banner. The tone color encodes the act's mood at a glance:
# green = healthy fleet, yellow = degradation, red = outage, magenta = extras.
act() {
  local tone="$1" label="$2" title="$3"
  printf '\n\n%s\n' "${tone}${RULE}${RESET}"
  printf '  %s%s\n' "${tone}${BOLD}${label}${RESET}" "${BOLD} · ${title}${RESET}"
  printf '%s\n' "${tone}${RULE}${RESET}"
}

say() { printf '\n  %s\n' "$*"; }

# Directs the audience's eyes to the console in the browser, as opposed to the
# live readings this terminal prints (data).
browser() { printf '\n  %s %s\n' "${MAGENTA}${BOLD}browser ▸${RESET}" "$*"; }
data() { printf '\n  %s %s\n' "${CYAN}${BOLD}fleet   ▸${RESET}" "$*"; }

# Waits for Enter. Pass a message when Enter triggers something specific,
# so the prompt says what is about to happen.
pause() {
  local msg="${1:-Press Enter to continue…}"
  printf '\n'
  read -r -p "  ${GREEN}▶${RESET} ${msg} " _
}

# -------------------------------------------------------------------- queries --

# Prints the fleet's freshness tally, e.g. "live: 47  unreachable: 3", tinting
# each state (live green, stale yellow, unreachable red, unknown dim).
fleet_summary() {
  curl -sf --max-time 3 "$SERVER_URL/api/fleet" | node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c)).on("end", () => {
      const counts = {};
      for (const r of JSON.parse(d).robots) {
        const f = String(r.freshness ?? "unknown").toLowerCase();
        counts[f] = (counts[f] ?? 0) + 1;
      }
      const order = ["live", "stale", "unreachable", "unknown"];
      const keys = [...order.filter((k) => k in counts),
                    ...Object.keys(counts).filter((k) => !order.includes(k))];
      const on = process.env.DEMO_COLOR === "1";
      const tint = { live: "\x1b[32m", stale: "\x1b[33m",
                     unreachable: "\x1b[31m", unknown: "\x1b[2m" };
      const paint = (k, s) => (on && tint[k] ? `${tint[k]}${s}\x1b[0m` : s);
      console.log(keys.map((k) => paint(k, `${k}: ${counts[k]}`)).join("  "));
    });' 2>/dev/null || echo "(fleet endpoint unreachable)"
}

# Polls the fleet tally once a second so the audience sees degradation happen.
watch_fleet() {
  local seconds="$1"
  for _ in $(seq 1 "$seconds"); do
    printf '  %s  %s\n' "${DIM}$(date +%H:%M:%S)${RESET}" "$(fleet_summary)"
    sleep 1
  done
}

show_health() {
  curl -sf --max-time 3 "$SERVER_URL/api/health" | node -e '
    let d = "";
    process.stdin.on("data", (c) => (d += c)).on("end", () => {
      console.log(JSON.stringify(JSON.parse(d), null, 2));
    });' 2>/dev/null || echo "(health endpoint unreachable)"
}

wait_for_server() {
  for _ in $(seq 1 60); do
    if curl -sf --max-time 2 "$SERVER_URL/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "Server did not become healthy at $SERVER_URL — see $LOG_DIR/server.log" >&2
  return 1
}

# ------------------------------------------------------------------ lifecycle --

start_server() {
  (cd "$ROOT" && pnpm --filter @fleet/server start >>"$LOG_DIR/server.log" 2>&1) &
  SERVER_PID=$!
  wait_for_server
  dim "  server up ($SERVER_URL), pid $SERVER_PID, log demo/.logs/server.log"
}

wait_for_web() {
  for _ in $(seq 1 60); do
    if curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "Console did not come up at $WEB_URL — see $LOG_DIR/web.log" >&2
  return 1
}

start_web() {
  (cd "$ROOT" && pnpm --filter web dev >>"$LOG_DIR/web.log" 2>&1) &
  WEB_PID=$!
  wait_for_web
  dim "  console up ($WEB_URL), pid $WEB_PID, log demo/.logs/web.log"
}

# Starts the tenant-B console on 5174, next to tenant A on 5173. Tenant is a
# build-time profile (ADR 17), so it needs its own vite process; both consoles
# share the one server on 8080. --strictPort makes a busy 5174 fail loudly
# instead of vite silently picking 5175. Returns nonzero rather than exiting so
# Act 7 can skip the extra without killing the demo.
start_tenant_web() {
  if port_in_use 5174; then
    echo "  Port 5174 is busy — skipping the tenant-B console." >&2
    return 1
  fi
  (cd "$ROOT" && VITE_TENANT=tenant-b pnpm --filter web dev -- --port 5174 --strictPort >>"$LOG_DIR/web-tenant-b.log" 2>&1) &
  TENANT_WEB_PID=$!
  for _ in $(seq 1 60); do
    if curl -sf --max-time 2 "$TENANT_URL" >/dev/null 2>&1; then
      dim "  tenant-B console up ($TENANT_URL), pid $TENANT_WEB_PID, log demo/.logs/web-tenant-b.log"
      return 0
    fi
    sleep 0.5
  done
  echo "  Tenant-B console did not come up at $TENANT_URL — see $LOG_DIR/web-tenant-b.log" >&2
  return 1
}

# Starts the simulator with any extra flags, e.g. start_sim --drop R-007,R-023,R-041
start_sim() {
  (cd "$ROOT" && pnpm --filter @fleet/simulator start -- "$@" >>"$LOG_DIR/simulator.log" 2>&1) &
  SIM_PID=$!
  dim "  simulator up (pid $SIM_PID)${*:+ with: $*}, log demo/.logs/simulator.log"
}

# Terminates a pnpm-wrapped process tree. pnpm start runs the real server four
# levels deep (subshell → pnpm shim → pnpm.mjs → tsx → node), so the kill must
# walk every descendant — signalling only the direct children orphans the node
# process that actually holds the port. Deepest-first, so nothing is reparented
# away mid-walk; the simulator and server both drain gracefully on SIGTERM.
kill_descendants() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    kill_descendants "$child"
    kill -TERM "$child" 2>/dev/null || true
  done
}

stop_tree() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill_descendants "$pid"
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

stop_sim() { stop_tree "$SIM_PID"; SIM_PID=""; }

# Blocks until the port is actually released so Act 5 shows a real outage and
# the next run's preflight doesn't trip over a still-draining process. The guard
# matters: cleanup calls this unconditionally, and without it a preflight abort
# (foreign process on 8080) would poll that foreign server for 5 s and then
# warn about a process this script never owned.
stop_server() {
  [ -n "$SERVER_PID" ] || return 0
  stop_tree "$SERVER_PID"
  SERVER_PID=""
  for _ in $(seq 1 10); do
    curl -sf --max-time 1 "$SERVER_URL/api/health" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  echo "  Warning: something still answers on $SERVER_URL after shutdown." >&2
}

# The server reads config/fleet-manifest.json once at startup and 404s any robot
# it does not list. The committed file holds 50 robots, so a 500-robot load run
# needs a 500-robot roster in place *before* the server starts — without it, 450
# of the 500 robots are rejected at ingest and the table never grows. The roster
# is generated by the simulator's own --print-manifest (same seed, so the first
# 50 robots are identical to the committed ones) and validated as JSON before it
# replaces anything. The committed file is backed up first and restored by
# cleanup on every exit path, so a Ctrl-C mid-load never leaves the tree dirty.
MANIFEST_FILE="$ROOT/config/fleet-manifest.json"
MANIFEST_BACKUP=""

swap_in_load_manifest() {
  local generated="$LOG_DIR/fleet-manifest.500.json"
  (cd "$ROOT" && pnpm --silent --filter @fleet/simulator start -- --robots 500 --print-manifest >"$generated" 2>/dev/null)
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$generated"
  MANIFEST_BACKUP="$LOG_DIR/fleet-manifest.committed.json"
  cp "$MANIFEST_FILE" "$MANIFEST_BACKUP"
  cp "$generated" "$MANIFEST_FILE"
  dim "  wrote a 500-robot config/fleet-manifest.json (committed file backed up)"
}

restore_manifest() {
  [ -n "$MANIFEST_BACKUP" ] || return 0
  mv "$MANIFEST_BACKUP" "$MANIFEST_FILE"
  MANIFEST_BACKUP=""
  dim "  restored the committed 50-robot config/fleet-manifest.json"
}

cleanup() {
  printf '\n'
  dim "Cleaning up demo processes…"
  stop_sim
  stop_tree "$WEB_PID"
  stop_tree "$TENANT_WEB_PID"
  stop_server
  restore_manifest
}
trap cleanup EXIT

# ------------------------------------------------------------------ preflight --

mkdir -p "$LOG_DIR"
: >"$LOG_DIR/server.log"
: >"$LOG_DIR/web.log"
: >"$LOG_DIR/web-tenant-b.log"
: >"$LOG_DIR/simulator.log"

act "$DIM" "SETUP" "Preflight"
if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo "  node and pnpm must both be on PATH." >&2
  exit 1
fi
version_at_least() {
  local installed="${1#v}" required="$2"
  [ "$(printf '%s\n%s\n' "$required" "$installed" | sort -V | head -n 1)" = "$required" ]
}
NODE_VERSION="$(node --version)"
PNPM_VERSION="$(pnpm --version)"
if ! version_at_least "$NODE_VERSION" "24.15.0"; then
  echo "  Node >= 24.15.0 is required; found $NODE_VERSION." >&2
  exit 1
fi
if ! version_at_least "$PNPM_VERSION" "11.20.0"; then
  echo "  pnpm >= 11.20.0 is required; found $PNPM_VERSION." >&2
  exit 1
fi
say "Node $NODE_VERSION, pnpm $PNPM_VERSION."
# Preflight clears the field itself. Any leftover process from this repo — a
# 'pnpm dev' stack (whose watch-mode simulator would feed the demo's fresh
# server and turn Act 1's Unknown into Live), a previous demo's server,
# console, or simulator — is stopped here, deepest-first. A simulator is a
# client, not a listener, so no port check can see it; this is the only guard
# that catches one. Matching is by command line *and* working directory, so
# dev stacks in other repos and editor tooling are never touched. Anything
# foreign still holding a port after this is reported, never killed.
port_in_use() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

say "Checking for leftover processes from this repo…"
CLEARED=""
while read -r stray_pid; do
  stray_cwd="$(readlink "/proc/$stray_pid/cwd" 2>/dev/null)" || continue
  case "$stray_cwd" in "$ROOT"*) ;; *) continue ;; esac
  stray_cmd="$(ps -o args= -p "$stray_pid" 2>/dev/null | cut -c1-72)" || true
  [ -n "$stray_cmd" ] || continue # already gone — killed as an earlier match's child
  case "$(ps -o state= -p "$stray_pid" 2>/dev/null)" in Z*) continue ;; esac # zombie: dead, holds nothing
  dim "  stopping leftover pid $stray_pid: $stray_cmd"
  kill_descendants "$stray_pid"
  kill -TERM "$stray_pid" 2>/dev/null || true
  CLEARED="yes"
done < <(pgrep -f 'src/index\.ts|src/main\.ts|@fleet/(simulator|server)|pnpm(\.mjs)?.* dev(:[a-z-]+)?$|vite\.js|vite$' 2>/dev/null || true)
if [ -n "$CLEARED" ]; then
  # Give the stopped processes a moment to drain and release their ports.
  for _ in $(seq 1 10); do
    port_in_use 8080 || port_in_use 5173 || port_in_use 5174 || break
    sleep 0.5
  done
  say "Leftovers stopped."
else
  say "None found."
fi
if port_in_use 8080; then
  echo "  Something not from this repo still holds port 8080 ($SERVER_URL)." >&2
  echo "  The demo will not kill it. 'kill \$(lsof -ti :8080)' does, if you mean to." >&2
  exit 1
fi
# A stale console is worse than a missing one: vite would silently pick 5174
# and the browser at 5173 would keep showing the old build all demo long.
if port_in_use 5173; then
  echo "  Something not from this repo still holds port 5173 ($WEB_URL)." >&2
  echo "  The demo will not kill it. 'kill \$(lsof -ti :5173)' does, if you mean to." >&2
  exit 1
fi
say "Starting the server and the console. The simulator waits until Act 2."
start_server
start_web
say "Open $WEB_URL in a browser. Keep it visible for the whole demo."
dim "  Banner colors ahead: ${GREEN}green = healthy${RESET}${DIM}, ${YELLOW}yellow = degradation${RESET}${DIM}, ${RED}red = outage${RESET}${DIM}, ${MAGENTA}magenta = extras${RESET}${DIM}."
pause

# ----------------------------------------------------------------------- acts --

act "$CYAN" "ACT 1" "Cold start: before the robots check in"
say "We'll start with the console connected, but no simulator running."
say "The fleet manifest tells the server to expect 50 robots, but none of them has reported yet."
say "With no telemetry to work from, every robot correctly starts as 'Unknown'."
data "$(fleet_summary)"
browser "confirm that the summary reads 'Unknown: 50' while the banner reads 'Stream connected'."
say "The console is connected, but it does not pretend to know the state of robots it has not heard from."
pause

act "$GREEN" "ACT 2" "Live fleet: three vendors, one table"
say "Starting the simulator with 50 robots reporting once a second across vendors A, B, and C."
start_sim
say "Giving the robots a few seconds to check in…"
sleep 4
data "$(fleet_summary)"
browser "the fleet is live. Take a moment to scan the table before opening a robot."
say "R-001 is vendor A, R-002 is vendor B, and R-003 is vendor C."
say "Three different vendor data formats are translated into one consistent fleet view."
say "Try using the site, vendor, freshness, and free-text filters."
say "Narrow the list to one robot, return to the full fleet, and then choose filters that produce no results."
browser "confirm that the designed no-results state appears instead of a blank table."
say "Finally, use only the keyboard to move through the filters and open a robot."
browser "confirm that focus stays visible and moves in a logical order."
pause

act "$GREEN" "ACT 3" "Capabilities and the technician view"
browser "open R-001, R-002, and R-003 in turn."
say "Notice how the capability panels reflect what each robot reports:"
say "Vendor A shows dock and lidar health, vendor B shows dock only, and vendor C shows dock and water level."
say "Now switch from the default Operator view to Technician."
say "The Technician view adds the adapter id and version, raw payload, sequence evidence, and timestamps."
say "Raw payloads are available only from the single-robot endpoint, never from the fleet read model or delta stream."
say "The battery sparkline loads historical readings only when you open a robot."
say "That keeps the fleet view lightweight and avoids fetching detailed history for robots you are not inspecting."
pause "Press Enter to inspect the adapter diagnostics…"
say "This is the server's health ledger. It counts unknown fields instead of silently ignoring them:"
printf '\n'
show_health | sed 's/^/  /'
data "follow byAdapter → C → unknownFields → fields."
say "Vendor C's undocumented field appears as the dotted path 'telemetry.firmware_channel'."
say "Vendors A and B remain at zero."
say "Vendor B's sequence block reads 'evaluated: false' because it has no counter to evaluate."
pause

act "$YELLOW" "ACT 4" "Three robots go silent"
say "Next, we'll stop R-007, R-023, and R-041 from reporting."
say "The rest of the fleet will keep reporting normally."
browser "bring those three rows into view. Search for 'R-0' or use the freshness filter."
say "After they stop reporting, each robot moves from Live to Stale after about 2 seconds, then to Unreachable after about 10 seconds."
say "The banner will continue to read 'Stream connected'."
say "The connection is healthy; only those three robots have gone silent. The UI keeps those conditions separate."
pause "Press Enter to drop the three robots…"
stop_sim
start_sim --drop R-007,R-023,R-041
say "We'll watch the fleet totals for 15 seconds."
say "The three robots should leave Live, pass through Stale, and settle in Unreachable."
dim "  (At 1 Hz, a healthy robot may briefly appear stale. That reflects the actual timing, not a bug.)"
printf '\n'
watch_fleet 15
say "The server treats silence as meaningful. Its 500 ms freshness sweep detects that the updates have stopped."
pause

act "$RED" "ACT 5" "The console loses its connection"
say "Next, we'll stop the server while the simulator is still sending updates."
say "The simulator will keep reporting, but there will be no server to receive those updates."
say "In Act 4, three robots went silent while the console stayed connected. This time, the console loses visibility of the entire fleet."
browser "bring the connection banner into view before continuing."
pause "Press Enter to kill the server…"
stop_server
data "The server is down. Nothing is responding at $SERVER_URL."
browser "watch the banner change to 'Stream reconnecting' within a few seconds."
say "Once the stream is down, every per-robot freshness label disappears."
say "Without a live connection, the console will not present old readings as current."
say "The rows remain visible, but only as last-known data."
say "The summary makes that clear with the heading 'Fleet freshness · last known'."
pause

act "$GREEN" "ACT 6" "Recovery without a reload"
say "Now we'll bring the server back and let the console recover on its own."
say "The reconnect loop detects the new server session and resynchronizes automatically."
browser "do not reload the page. Watch the banner return to 'Stream connected'."
say "The freshness labels will reappear, and the rows will move from Unknown to Live as updates arrive."
pause "Press Enter to restart the server…"
start_server
sleep 2
data "$(fleet_summary)"
say "Now look at R-007, R-023, and R-041. This new server process has never received an update from them."
say "They appear as Unknown, not Unreachable, because the server only reports what it has observed."
say "Next, we'll restart the simulator without the drop option so those three robots can report again."
stop_sim
start_sim
say "We'll watch for 8 seconds as they rejoin the fleet and return to Live."
printf '\n'
watch_fleet 8
pause

act "$MAGENTA" "ACT 7" "Optional scale and tenant demonstrations"
say "We'll finish with two optional demos: scale and tenant configuration."
say "Our documented, measured load profile is 500 robots at 5 Hz, or about 2,500 requests per second:"
dim "      pnpm --filter @fleet/simulator start -- --robots 500 --hz 5"
say "That is the workload we've verified, not a claimed ceiling."
say "Tenant B uses typed configuration to hide the lidar panel:"
dim "      pnpm dev:tenant-b                       # whole stack as tenant B"
dim "      VITE_TENANT=tenant-b pnpm --filter web dev   # console only"
printf '\n'
read -r -p "  ${GREEN}▶${RESET} Run the 500-robot load profile now? [y/N] " answer
if [[ "${answer:-n}" =~ ^[Yy]$ ]]; then
  say "Before we run it, the server needs a manifest that lists all 500 robots."
  say "The committed manifest lists 50, so we'll generate a larger one and restart the server."
  say "The simulator uses the same seed, which keeps the first 50 robots identical and adds R-051 through R-500."
  swap_in_load_manifest
  say "Now we'll restart the server with the 500-robot manifest. This resets the fleet state."
  stop_sim
  stop_server
  start_server
  browser "watch the console reconnect on its own. The table now contains 500 rows."
  say "All 500 begin as Unknown because this new server process has not received any updates yet."
  say "Now we'll start 500 robots at 5 Hz, producing about 2,500 requests per second."
  start_sim --robots 500 --hz 5
  say "The load is running. ADR 24 keeps the table unvirtualized because this scale has been measured and remains usable."
  say "We'll watch for 15 seconds as the Live count climbs toward 500."
  printf '\n'
  watch_fleet 15
  browser "scroll through the 500 live rows, then use search to narrow the table to one robot."
  say "When the demo shuts down, it will restore the committed 50-robot manifest."
fi
printf '\n'
read -r -p "  ${GREEN}▶${RESET} Start the Tenant B console next to Tenant A? [y/N] " answer
if [[ "${answer:-n}" =~ ^[Yy]$ ]]; then
  say "ADR 17 defines each tenant as a build-time profile: the components stay the same while the configuration changes."
  say "We'll start a second console for Tenant B on port 5174, connected to the same server and fleet."
  if start_tenant_web; then
    browser "open $TENANT_URL next to $WEB_URL."
    say "Tenant B uses the light theme and the 'Northwind Robotics' wordmark."
    browser "open robot R-001 in both consoles."
    say "Tenant A shows the lidar panel, while Tenant B hides it through flags.lidarHealthPanel."
    say "The component never checks the tenant name; the typed configuration controls the feature."
    dim "  (pnpm dev:tenant-b runs the whole stack this way from a clean terminal)"
    pause
  fi
fi

act "$DIM" "FIN" "The failure and recovery paths are committed automation"
say "pnpm test:e2e runs seven scenarios against the real server, simulator,"
say "and production bundle, including Acts 4, 5, and 6."
say "The suite runs in Chromium and Firefox, with WebKit included in CI."
pause "Press Enter to shut everything down…"
