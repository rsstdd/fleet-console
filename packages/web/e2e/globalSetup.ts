import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds the console once before the production browser projects run (ADR 32).
 *
 * The harness serves the production bundle through `vite preview` rather than the dev
 * server, deliberately: the development build re-renders the 50-row table through React's
 * dev-mode machinery on every 10 Hz flush, which profiling showed saturates a core and
 * starves every Playwright actionability check. The evidence the suite exists to produce
 * is about what users run, and users run this build. The component-gallery project is the
 * deliberate exception: its route exists only in Vite development, so it ignores this build.
 *
 * Always a fresh build, never a staleness check: a preview server silently serving last
 * week's `dist/` would make every green run a lie about today's code.
 */

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default async function globalSetup(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const build = spawn(path.join(WEB_DIR, "node_modules", ".bin", "vite"), ["build"], {
      cwd: WEB_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: string[] = [];
    build.stdout.on("data", (chunk: unknown) => output.push(String(chunk)));
    build.stderr.on("data", (chunk: unknown) => output.push(String(chunk)));
    build.once("error", reject);
    build.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`vite build exited with ${String(code)}:\n${output.join("")}`));
      }
    });
  });
}
