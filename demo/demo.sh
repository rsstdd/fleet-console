#!/usr/bin/env bash
# Guided demonstration driver for the fleet console.
#
# Walks a presenter through the seven acts in demo/DEMO.md: it starts the server,
# console, and simulator itself, injects the fault scenarios (--drop, server kill,
# restart), and prints live fleet/health summaries between acts. The browser half of
# the show stays in your hands — keep http://localhost:5173 visible throughout.
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
say "Node $(node --version), pnpm $(pnpm --version)."
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

act "$CYAN" "ACT 1" "Cold start: UNKNOWN is honest"
say "No simulator is running yet."
say "The server seeded 50 robots from the fleet manifest."
say "It has never heard from any of them, and it says so. Every row reads 'Unknown'."
data "$(fleet_summary)"
browser "the summary strip reads 'Unknown: 50'. The banner reads 'Stream connected'."
pause

act "$GREEN" "ACT 2" "Live fleet: three dialects, one table"
say "Starting the simulator: 50 robots at 1 Hz across vendors A, B, and C."
start_sim
say "Giving it a few seconds to report…"
sleep 4
data "$(fleet_summary)"
browser "the table is live now. Scan it before opening anything."
say "R-001 is vendor A. R-002 is vendor B. R-003 is vendor C."
say "Three wire dialects. One table. No vendor branches."
say "Try the site, vendor, and freshness filters. Try search."
pause

act "$GREEN" "ACT 3" "Adapters up close: capabilities, personas, unknown fields"
browser "open R-001, then R-002, then R-003."
say "The capability panels differ by vendor:"
say "A shows dock + lidar health. B shows dock only. C shows dock + water level."
say "In the Robot View, flip the persona toggle to Technician."
say "It reveals the adapter id and version, the raw payload, and sequence evidence."
say "The battery sparkline fetches its history when you open the robot."
pause "Press Enter to fetch /api/health…"
say "This is the server's health ledger. Unknown fields are counted, never silently ignored:"
printf '\n'
show_health | sed 's/^/  /'
data "find byAdapter → C → unknownFields → fields."
say "Vendor C's undocumented field is there as the dotted path 'telemetry.firmware_channel'."
say "A and B stay at zero."
say "B's sequence block reads 'evaluated: false' — vendor B has no counter to evaluate."
pause

act "$YELLOW" "ACT 4" "Robots go silent (stream stays up)"
say "Next: drop three robots. R-007, R-023, and R-041 will stop sending."
say "Everything else stays healthy."
browser "get those three rows on screen first. Search 'R-0' or filter by freshness."
say "Once dropped, each goes Live → Stale (~2 s) → Unreachable (~10 s)."
say "The banner will keep reading 'Stream connected'."
say "The stream is fine. The robots are not. That difference is the point."
pause "Press Enter to drop the three robots…"
stop_sim
start_sim --drop R-007,R-023,R-041
say "Watching the fleet tally for 15 seconds."
say "Expect 3 robots to leave live:, pass through stale:, and settle in unreachable:."
dim "  (a healthy robot may flicker stale for a beat at 1 Hz — honest, not a bug)"
printf '\n'
watch_fleet 15
say "Silence is an event. The server's 500 ms sweep noticed the absence."
pause

act "$RED" "ACT 5" "The console goes blind (server killed)"
say "Next: kill the server mid-stream."
say "The simulator keeps sending into the void. That is fine."
say "Act 4 was a silent robot. This is a blind console. They must look different."
browser "get everyone's eyes on the banner before you continue."
pause "Press Enter to kill the server…"
stop_server
data "server is down. Nothing answers on $SERVER_URL."
browser "within a few seconds the banner flips to 'Stream reconnecting'."
say "Every per-robot freshness label disappears. The console will not guess per row."
say "Rows keep their last-known data."
say "The summary heading now reads 'Fleet freshness · last known'."
pause

act "$GREEN" "ACT 6" "Recovery: no reload, no retry"
say "Next: restart the server. The console recovers on its own."
say "Its jittered reconnect detects the new serverSessionId and re-joins fresh."
browser "touch nothing. Watch for three things: the banner returns to"
say "'Stream connected', freshness labels come back, and rows flood from"
say "Unknown to Live. No page reload."
pause "Press Enter to restart the server…"
start_server
sleep 2
data "$(fleet_summary)"
say "Look at the trio. This fresh process has never heard from R-007, R-023, R-041."
say "So they read Unknown — not Unreachable. The server only claims what it saw."
say "Now restarting the simulator without --drop. The trio resumes from frozen state."
stop_sim
start_sim
say "Watching for 8 seconds. Expect the trio to rejoin live:."
printf '\n'
watch_fleet 8
pause

act "$MAGENTA" "ACT 7" "Optional: scale and tenancy"
say "Two extras. Both optional."
say "The documented load profile is 500 robots at 5 Hz (~2,500 requests/s):"
dim "      pnpm --filter @fleet/simulator start -- --robots 500 --hz 5"
say "And the Tenant B build gates the lidar panel off via typed config:"
dim "      pnpm dev:tenant-b                       # whole stack as tenant B"
dim "      VITE_TENANT=tenant-b pnpm --filter web dev   # console only"
printf '\n'
read -r -p "  ${GREEN}▶${RESET} Run the 500-robot load profile now? [y/N] " answer
if [[ "${answer:-n}" =~ ^[Yy]$ ]]; then
  say "The server only accepts robots its manifest lists, and the committed"
  say "manifest holds 50. So this needs a 500-robot manifest and a server restart."
  say "Generating one with the simulator's --print-manifest. Same seed:"
  say "the first 50 robots are identical, R-051 through R-500 are new."
  swap_in_load_manifest
  say "Restarting the server on the 500-robot manifest. Fleet state resets."
  stop_sim
  stop_server
  start_server
  browser "the console reconnects on its own. The table now holds 500 rows,"
  say "all Unknown — none of the 450 new robots has ever reported."
  say "Starting the simulator: 500 robots at 5 Hz (~2,500 requests/s)."
  start_sim --robots 500 --hz 5
  say "Load is running. The un-virtualized table absorbs this by measurement (ADR 24)."
  say "Watching for 15 seconds. Expect live to climb to 500:"
  printf '\n'
  watch_fleet 15
  browser "scroll the table. 500 live rows, and search still narrows to one."
  say "After the demo shuts down, the committed 50-robot manifest is restored."
fi
printf '\n'
read -r -p "  ${GREEN}▶${RESET} Start the tenant-B console next to tenant A? [y/N] " answer
if [[ "${answer:-n}" =~ ^[Yy]$ ]]; then
  say "Tenant is a build-time profile (ADR 17). Same components, different config."
  say "Starting a second console: tenant B on port 5174. Same server, same fleet."
  if start_tenant_web; then
    browser "open $TENANT_URL next to $WEB_URL."
    say "Tenant B ships the light theme and the 'Northwind Robotics' wordmark."
    browser "open robot R-001 in both consoles."
    say "Tenant A shows the lidar panel. Tenant B does not — flags.lidarHealthPanel"
    say "gates it off. No component branches on tenant. The config decides."
    dim "  (pnpm dev:tenant-b runs the whole stack this way from a clean terminal)"
    pause
  fi
fi

act "$DIM" "FIN" "Everything you just showed is committed automation"
say "pnpm test:e2e replays Acts 2, 4, 5, and 6 against the real stack,"
say "in Chromium, Firefox, and WebKit."
pause "Press Enter to shut everything down…"
