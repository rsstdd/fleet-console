import { test as base } from "@playwright/test";

import { startStack, type Stack } from "./stack.ts";

/**
 * The per-test stack fixture: every test gets a freshly started real stack and is
 * guaranteed a fully torn-down one afterwards, however it exited (ADR 32).
 *
 * Fresh per test rather than shared, deliberately: the scenarios mutate process state —
 * they stop the simulator, kill the server, restart it — and a shared stack would make
 * each test's starting state whatever the previous test left behind. The startup cost is
 * a few seconds; the alternative is ordering coupling, which is where browser-suite
 * flake comes from. Projects run with one worker for the same reason
 * (`playwright.config.ts`).
 *
 * On failure the whole stack's retained stdout/stderr is attached to the report, so a
 * red CI run explains itself without a rerun.
 */

/** Ports fixed per project so parallel projects could never collide; see the config. */
export interface StackOptions {
  readonly serverPort: number;
  readonly vitePort: number;
  /** The bundle `vite preview` serves; undefined means the default `dist` build. */
  readonly viteOutDir: string | undefined;
}

interface Fixtures {
  stack: Stack;
}

export const test = base.extend<Fixtures & StackOptions>({
  serverPort: [8390, { option: true }],
  vitePort: [5390, { option: true }],
  viteOutDir: [undefined, { option: true }],

  // Playwright calls this parameter `use`; renamed so the React hooks lint, which has
  // no way to know this file never renders, does not read it as the `use()` hook.
  stack: async ({ serverPort, vitePort, viteOutDir }, provide, testInfo) => {
    const stack = await startStack({ server: serverPort, vite: vitePort }, { outDir: viteOutDir });
    try {
      await provide(stack);
    } finally {
      await stack.dispose();
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("stack-logs", { body: stack.logs(), contentType: "text/plain" });
      }
    }
  },
});

export { expect } from "@playwright/test";
