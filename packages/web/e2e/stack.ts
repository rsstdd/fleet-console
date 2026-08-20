import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * The real-stack harness: the actual server, the actual simulator, and the actual Vite
 * dev server, each on an isolated port, with explicit readiness and bounded teardown
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
 * The console is served as `vite preview` over the production bundle built once in
 * `globalSetup.ts`, not as the dev server: the development build's render cost at 10 Hz
 * is measured to starve the browser, and the claim under test is about the build users
 * get. Preview forwards `/api` and `/ws` exactly as the dev proxy does
 * (`vite.config.ts`).
 *
 * Coupling: port wiring mirrors production configuration, not test doubles. The server
 * reads `FLEET_SERVER_PORT` (`packages/server/src/config/runtimeEndpoints.ts`), Vite's
 * proxy reads the same key (`packages/web/src/config/devServerTarget.ts`), and the
 * simulator takes `--endpoint` — so the stack under test is joined exactly the way
 * the deployed console joins its server (ADR 21).
 */

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(WEB_DIR, "..", "..");

/** How long a process gets to exit after SIGTERM before the group is SIGKILLed. */
const GRACEFUL_EXIT_MS = 5_000;

/** How long readiness polling waits before declaring the stack broken. */
const READY_TIMEOUT_MS = 30_000;

/** One spawned process with its retained output. */
export interface ManagedProcess {
  readonly name: string;
  readonly logs: string[];
  /** Terminates the whole process group, escalating to SIGKILL after a bounded wait. */
  stop(): Promise<void>;
  readonly exited: Promise<number | null>;
}

/** Spawns one command in its own process group and retains its output. */
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
      const response = await fetch(url);
      if (response.ok) return;
      lastFailure = `status ${String(response.status)}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
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
  /** The console's origin — the Vite dev server, proxying `/api` and `/ws`. */
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
    /**
     * Which production bundle `vite preview` serves. Defaults to `dist`, the
     * tenant-A build from `globalSetup.ts`; the tenant-B project points this at
     * the bundle its own beforeAll built (ADR 17, ADR 32).
     */
    readonly outDir?: string;
  } = {},
): Promise<Stack> {
  const serverUrl = `http://127.0.0.1:${String(ports.server)}`;
  const consoleUrl = `http://127.0.0.1:${String(ports.vite)}`;
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
        env: { FLEET_SERVER_HOST: "127.0.0.1", FLEET_SERVER_PORT: String(ports.server) },
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

  await spawnServer();
  if (options.simulator !== false) spawnSimulator();

  const vite = launch(
    "vite",
    path.join(WEB_DIR, "node_modules", ".bin", "vite"),
    [
      "preview",
      "--port",
      String(ports.vite),
      "--strictPort",
      ...(options.outDir === undefined ? [] : ["--outDir", options.outDir]),
    ],
    {
      cwd: WEB_DIR,
      env: { FLEET_SERVER_HOST: "127.0.0.1", FLEET_SERVER_PORT: String(ports.server) },
    },
  );
  processes.push(vite);
  await waitForHttp(consoleUrl, processes);

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
    dispose: async () => {
      // Newest first, so nothing writes to a listener that is already gone.
      for (const managed of [...processes].reverse()) {
        await managed.stop();
      }
    },
  };
}
