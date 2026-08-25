import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * The real-stack harness: the actual server, the actual simulator, and the actual Vite
 * server, each on an isolated port, with explicit readiness and bounded teardown
 * (ADR 32).
 *
 * Built on Node built-ins only, deliberately: the one new dependency ADR 32 admits is
 * `@playwright/test` itself. Every process is spawned in its own group so teardown can
 * kill the whole tree — `tsx` and `vite` both fork children, and a leaked child is the
 * failure mode the plan's cleanup proof exists to catch.
 *
 * Readiness is polled against real endpoints — `GET /api/health` for the server, the
 * page itself for Vite — never slept for. Stdout and stderr are retained per process so
 * a failing test can attach the logs that explain it.
 *
 * Product scenarios use `vite preview` over the production bundle built once in
 * `globalSetup.ts`, not as the dev server: the development build's render cost at 10 Hz
 * is measured to starve the browser, and the claim under test is about the build users
 * get. Preview forwards `/api` and `/ws` exactly as the dev proxy does
 * (`vite.config.ts`). The DEV-only component-gallery project selects the development
 * server because that route is intentionally absent from production output.
 *
 * Coupling: port wiring mirrors production configuration, not test doubles. The server
 * reads `FLEET_SERVER_PORT` (`packages/server/src/config/runtimeEndpoints.ts`), Vite's
 * proxy reads the same key (`packages/web/src/config/devServerTarget.ts`), and the
 * simulator takes `--endpoint` — so the stack under test is joined exactly the way
 * the deployed console joins its server (ADR 21).
 */

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(WEB_DIR, "..", "..");

/**
 * How long a process gets to exit after SIGTERM before the group is SIGKILLed.
 *
 * Long enough for `tsx` and `vite` to run their own shutdown and release the port: the
 * next test's stack binds the same one under `--strictPort`, so a straggler here fails a
 * later test instead of this one. Short enough that a hung child cannot eat the test
 * timeout — escalating is the point, and waiting is only worth doing while a clean exit
 * is still plausible.
 */
const GRACEFUL_EXIT_MS = 5_000;

/**
 * How long readiness polling waits before declaring the stack broken.
 *
 * Sized for a cold `tsx` start with nothing cached, which is the slowest thing this
 * waits on. Past that the process is not starting slowly, it is failing — and the throw
 * attaches every retained log line, which answers the question a longer wait would not.
 */
const READY_TIMEOUT_MS = 30_000;

/**
 * Gap between readiness probes.
 *
 * Short enough that a fast start is not padded by most of an interval, long enough that
 * a booting server is not spending its first second answering this instead of booting.
 */
const READY_POLL_INTERVAL_MS = 200;

/**
 * The loopback address every part of the harness agrees on.
 *
 * One constant rather than three literals: the server's `FLEET_SERVER_HOST`, Vite's
 * `--host`, and the origins the probes and the browser are pointed at have to name the
 * same interface, and a stack whose pieces disagree fails as a readiness timeout that
 * looks like slowness.
 */
const LOOPBACK_HOST = "127.0.0.1";

/** Owns a whole process group so teardown cannot strand `tsx` or Vite children. */
export interface ManagedProcess {
  readonly name: string;
  readonly logs: string[];
  /** Terminates the whole process group, escalating to SIGKILL after a bounded wait. */
  stop(): Promise<void>;
  readonly exited: Promise<number | null>;
}

function launch(
  name: string,
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: Readonly<Record<string, string>> },
): ManagedProcess {
  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const logs: string[] = [];
  const retain = (chunk: unknown): void => {
    for (const line of String(chunk).split("\n")) {
      if (line.trim() !== "") logs.push(line);
    }
  };
  child.stdout?.on("data", retain);
  child.stderr?.on("data", retain);

  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => {
      resolve(code);
    });
  });

  return {
    name,
    logs,
    exited,
    stop: async () => {
      if (child.exitCode !== null || child.pid === undefined) return;
      // Negative pid addresses the group, so tsx's and vite's own children die too.
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        return;
      }
      const graceful = await Promise.race([
        exited,
        new Promise<"timeout">((resolve) =>
          setTimeout(() => {
            resolve("timeout");
          }, GRACEFUL_EXIT_MS),
        ),
      ]);
      if (graceful === "timeout") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // Already gone between the check and the kill; that is the outcome we wanted.
        }
        await exited;
      }
    },
  };
}

/** Polls a URL until it answers 2xx, or throws with the retained process logs. */
async function waitForHttp(url: string, processes: readonly ManagedProcess[]): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastFailure = "no attempt made";
  while (Date.now() < deadline) {
    try {
      // Bounded by what is left of the deadline: a socket that connects and then never
      // sends headers parks this await indefinitely, and the loop condition is only
      // reached between attempts — so the fixture would never get to tear the stack down.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.max(0, deadline - Date.now())),
      });
      if (response.ok) return;
      lastFailure = `status ${String(response.status)}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
  }
  const logs = processes
    .map((managed) => `--- ${managed.name} ---\n${managed.logs.join("\n")}`)
    .join("\n");
  throw new Error(`Timed out waiting for ${url} (${lastFailure}).\n${logs}`);
}

/** What a stack needs to know about its ports; fixed per Playwright project. */
export interface StackPorts {
  readonly server: number;
  readonly vite: number;
}

/** A running stack, with the independent process controls the scenarios drive. */
export interface Stack {
  /** The console's origin — the selected Vite server, proxying `/api` and `/ws`. */
  readonly consoleUrl: string;
  /** Direct server origin, for readiness checks and snapshot capture. */
  readonly serverUrl: string;
  /** Every process's retained output, for attachment on failure. */
  readonly logs: () => string;
  /** Stops the server process; rows must survive this. */
  stopServer(): Promise<void>;
  /** Starts a fresh server process on the same port — a restart, new session (ADR 31). */
  startServer(): Promise<void>;
  /** Stops the simulator; freshness must degrade while the stream stays connected. */
  stopSimulator(): Promise<void>;
  /** Fire-and-forget: the simulator has no readiness endpoint, only its first posts. */
  startSimulator(): void;
  /** Tears the whole stack down, leaving no process, socket, or timer behind. */
  dispose(): Promise<void>;
}

/** Starts server, simulator, and Vite, waiting for each to be genuinely ready. */
export async function startStack(
  ports: StackPorts,
  options: {
    readonly simulator?: boolean;
    readonly viteMode?: "development" | "preview";
    /**
     * Which production bundle `vite preview` serves. Defaults to `dist`, the
     * tenant-A build from `globalSetup.ts`; the tenant-B project points this at
     * the bundle its own beforeAll built (ADR 17, ADR 32).
     */
    readonly outDir?: string;
  } = {},
): Promise<Stack> {
  const serverUrl = `http://${LOOPBACK_HOST}:${String(ports.server)}`;
  const consoleUrl = `http://${LOOPBACK_HOST}:${String(ports.vite)}`;
  const processes: ManagedProcess[] = [];
  let server: ManagedProcess | null = null;
  let simulator: ManagedProcess | null = null;

  const spawnServer = async (): Promise<void> => {
    const serverDir = path.join(REPO_ROOT, "packages", "server");
    server = launch(
      "server",
      path.join(serverDir, "node_modules", ".bin", "tsx"),
      ["src/main.ts"],
      {
        cwd: serverDir,
        env: { FLEET_SERVER_HOST: LOOPBACK_HOST, FLEET_SERVER_PORT: String(ports.server) },
      },
    );
    processes.push(server);
    await waitForHttp(`${serverUrl}/api/health`, processes);
  };

  const spawnSimulator = (): void => {
    simulator = launch(
      "simulator",
      process.execPath,
      ["src/index.ts", "--endpoint", serverUrl, "--seed", "7"],
      { cwd: path.join(REPO_ROOT, "packages", "simulator") },
    );
    processes.push(simulator);
  };

  /** Newest first, so nothing writes to a listener that is already gone. */
  const stopAll = async (): Promise<void> => {
    for (const managed of [...processes].reverse()) {
      await managed.stop();
    }
  };

  // A readiness timeout here rejects before any caller holds a `dispose`, so whatever
  // already started is unreachable and unkillable. The next test binds these same ports
  // under `--strictPort`, so the leak fails a later test rather than this one.
  try {
    await spawnServer();
    if (options.simulator !== false) spawnSimulator();

    const viteMode = options.viteMode ?? "preview";
    const vite = launch(
      "vite",
      path.join(WEB_DIR, "node_modules", ".bin", "vite"),
      [
        ...(viteMode === "preview" ? ["preview"] : []),
        "--port",
        String(ports.vite),
        "--strictPort",
        // Bound to the literal address the readiness probe and the browser use, never
        // left to Vite's `localhost` default. `localhost` is resolved by Node, which
        // since v17 returns records verbatim rather than preferring IPv4 — so on a host
        // whose `/etc/hosts` maps `localhost` to `::1` as well (the GitHub Actions
        // ubuntu runners do; a WSL box typically does not) preview binds IPv6-only and
        // every `http://127.0.0.1` probe here gets ECONNREFUSED. That failure reads as
        // "Timed out waiting for ... (fetch failed)" after the full readiness budget,
        // with a healthy server and simulator in the attached logs, and it fails every
        // test in every project at once.
        "--host",
        LOOPBACK_HOST,
        ...(viteMode === "preview" && options.outDir !== undefined
          ? ["--outDir", options.outDir]
          : []),
      ],
      {
        cwd: WEB_DIR,
        env: { FLEET_SERVER_HOST: LOOPBACK_HOST, FLEET_SERVER_PORT: String(ports.server) },
      },
    );
    processes.push(vite);
    await waitForHttp(consoleUrl, processes);
  } catch (error) {
    await stopAll();
    throw error;
  }

  return {
    consoleUrl,
    serverUrl,
    logs: () =>
      processes.map((managed) => `--- ${managed.name} ---\n${managed.logs.join("\n")}`).join("\n"),
    stopServer: async () => {
      await server?.stop();
      server = null;
    },
    startServer: async () => {
      if (server !== null) return;
      await spawnServer();
    },
    stopSimulator: async () => {
      await simulator?.stop();
      simulator = null;
    },
    startSimulator: () => {
      if (simulator !== null) return;
      spawnSimulator();
    },
    dispose: stopAll,
  };
}
