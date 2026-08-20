// The workspace's dependency allow-list, and the check that fails a build which
// adds a package nobody vetted.
//
// WHAT THIS GATE IS FOR (ADR 29 § Argument). Every other supply-chain rule in this
// repository is a deny-list: `packages/server/eslint.config.js` names nine storage
// and broker packages ADR 2 and ADR 6 decided against, and each package's
// `no-restricted-imports` names the workspace siblings it may not reach. A deny-list
// answers "did you add the one thing we already thought of". It cannot answer "did
// you add a single-use package for something the standard library already does",
// because that package's name was never on anyone's list.
//
// `packages/adapters/eslint.config.js` already states the reasoning for workspace
// imports: "naming the three current siblings instead would admit a fourth package
// by omission, which is the failure mode ADR 7 records — a rule that permits by
// silence is not a rule." This file applies that same argument to npm.
//
// The failure it prevents is specific and was demonstrated before it was written: a
// probe file importing an installed-but-unvetted package passed `pnpm lint` with
// exit 0. Undeclared imports were already caught — pnpm's isolated `node_modules`
// plus `tsc` reject them — so the hole was exactly the *declared* dependency, which
// is the form an agent adds one in.
//
// WHY THIS IS HAND-WRITTEN. `depcheck` and `knip` do the unused half of this well
// and neither does the vetting half, so adopting one would add a dependency in
// order to police dependencies while leaving the actual gate unbuilt. The scan
// below is roughly eighty lines against a five-package workspace. Principle 1's
// preference for one authoritative implementation is better served by that than by
// a tool plus the allow-list it cannot express.
//
// THE LIMIT, STATED PLAINLY. Usage is proven for `import` entries only. A `tool`,
// `types`, or `peer` entry is invoked by a command or named as a string in a
// config, so no import exists to find; those are held by the one-line reason each
// carries here, read by a human, and an unused one survives this check. That is a
// deliberate trade against the false positives a heuristic for "is this CLI still
// run" would produce. The import majority is where an agent's additions land.
//
// Coupling: `pnpm-workspace.yaml` holds the release-age quarantine this file
// asserts is switched on, and `.github/workflows/ci.yml` runs both this gate and
// the vulnerability audit ADR 29 pairs with it.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * How a vetted package earns its place, and what this checker can therefore prove.
 *
 * `import` is the only kind whose use is mechanically verified: the package that
 * declares it must import it somewhere. The other three name the reason no import
 * exists, so that a reader can tell an unimportable dependency from a forgotten one.
 */
const KINDS = new Set(["import", "tool", "types", "peer"]);

/**
 * Every third-party package this workspace is permitted to declare.
 *
 * An entry is a decision, not an inventory line: adding one is the reviewable act
 * this gate exists to force, which is why the reason is required and is written for
 * the reviewer who has to judge whether a native API would have done instead.
 * Workspace packages (`workspace:*`) are absent deliberately — the import direction
 * between them is already enforced by each package's ESLint boundary rules, and
 * restating the graph here would give it a second authority (Principle 1).
 */
const ALLOWED = {
  // Runtime
  zod: { kind: "import", why: "Canonical schema decoding at every boundary (Principle 2)." },
  react: { kind: "import", why: "The console's UI runtime (ADR 4)." },
  "react-dom": { kind: "import", why: "React's browser renderer; paired with react." },
  "react-router": {
    kind: "import",
    why: "Routing for the app shell (docs/01_page-specs/01_APP_SHELL.md).",
  },
  "@mui/material": {
    kind: "import",
    why: "The component library ADR 5 selected, consumed through tokens only.",
  },
  "@emotion/react": {
    kind: "peer",
    why: "MUI's default style engine. Required at runtime by @mui/material, not imported directly (ADR 5).",
  },
  "@emotion/styled": {
    kind: "peer",
    why: "The styled() half of MUI's style engine; same standing as @emotion/react.",
  },
  "@fontsource/ibm-plex-sans": {
    kind: "import",
    why: "Self-hosted UI typeface; the bundle budget counts its subsets (ADR 22).",
  },
  "@fontsource/ibm-plex-mono": {
    kind: "import",
    why: "Self-hosted numeric/monospace face for data plates (docs/DESIGN_SYSTEM.md).",
  },
  hono: {
    kind: "import",
    why: "Router only for the server's five routes (ADR 8); its validators and RPC client are deliberately unused, because a second decode authority would violate Principle 1.",
  },

  // Toolchain invoked as a command
  typescript: { kind: "tool", why: "Invoked as `tsc` by every package's typecheck script." },
  vite: { kind: "tool", why: "Invoked as `vite` for the console's dev server and build." },
  vitest: { kind: "import", why: "Test runner; its assertions are imported by every test file." },
  "@vitest/coverage-v8": {
    kind: "tool",
    why: "Loaded by vitest under --coverage; reported, not gated (ADR 22).",
  },
  eslint: {
    kind: "tool",
    why: "Invoked as `eslint` per package, and programmatically by the boundary-enforcement suites.",
  },
  prettier: {
    kind: "import",
    why: "Formats the tree, and scripts/architectureDocs.mjs imports it to render the decision index.",
  },
  stylelint: { kind: "tool", why: "Invoked as `stylelint` over the console's stylesheets." },
  jsdom: { kind: "tool", why: "Named as vitest's `environment` string; never imported." },
  tsx: {
    kind: "tool",
    why: "The workspace's TypeScript runtime for the server (ADR 9); the reason esbuild's build script is approved.",
  },

  // ESLint configuration, imported by each package's flat config
  "@eslint/js": { kind: "import", why: "The recommended rule set each eslint.config.js extends." },
  "typescript-eslint": {
    kind: "import",
    why: "Typed linting; the strictTypeChecked preset every package builds on.",
  },
  globals: {
    kind: "import",
    why: "Environment global sets for flat config; there is no built-in equivalent.",
  },
  "eslint-import-resolver-typescript": {
    kind: "tool",
    why: "Named as a resolver string in packages/web's config so boundaries/dependencies can classify aliased imports (ADR 7).",
  },
  "eslint-plugin-boundaries": {
    kind: "import",
    why: "Enforces the layer direction in packages/web (Principle 9, ADR 4).",
  },
  "eslint-plugin-jsx-a11y": {
    kind: "import",
    why: "Accessibility rules gated in CI rather than repeated in the PR template.",
  },
  "eslint-plugin-react-hooks": {
    kind: "import",
    why: "Hook rules; a violation here is a correctness bug, not a style nit.",
  },
  "eslint-plugin-react-refresh": {
    kind: "import",
    why: "Keeps fast-refresh boundaries intact in dev.",
  },
  "eslint-plugin-jsdoc": {
    kind: "import",
    why: "Supplies jsdoc/informative-docs, the mechanical form of the house comment rule (ADR 28).",
  },
  "stylelint-config-standard": {
    kind: "tool",
    why: "Named by string in the stylelint config it extends.",
  },

  // Tests
  "@testing-library/react": {
    kind: "import",
    why: "Renders components against the accessibility tree, which is what the specs assert on.",
  },
  "@testing-library/user-event": {
    kind: "import",
    why: "Real event sequences for keyboard-path tests.",
  },
  "@testing-library/jest-dom": {
    kind: "import",
    why: "DOM matchers imported by the console's test setup file.",
  },
  "@vitejs/plugin-react": {
    kind: "import",
    why: "Imported by vite.config.ts; React transform for build and test.",
  },

  // Type declarations consumed by the compiler
  "@types/node": { kind: "types", why: "Node's own API surface; no import of its own." },
  "@types/react": { kind: "types", why: "React's declarations, versioned against react." },
  "@types/react-dom": { kind: "types", why: "react-dom's declarations." },
};

/**
 * Directories that hold no first-party source and are never scanned for imports.
 *
 * `__enforcement__` and `__boundary-violation__` hold deliberate rule violations, kept
 * so a lint rule that stops firing fails a test instead of going quiet (Principle 15,
 * ADR 7). Every ESLint config already excludes them; this checker did not, so on
 * 20 August 2026 a fixture written to prove ADR 11's Node-free ban — it imports bare
 * `fs` on purpose — was reported here as an undeclared dependency. A file that exists
 * to be wrong must not be read as a claim about what this repository depends on.
 */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "__enforcement__",
  "__boundary-violation__",
]);

/** Extensions that can carry a module specifier this checker needs to see. */
const SCANNED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);

/**
 * Every syntactic form in this repository that names another package.
 *
 * The CSS `@import` form is here because the console's typefaces arrive that way;
 * omitting it would report `@fontsource/*` as unused and teach the next reader that
 * the unused check is noise.
 */
const SPECIFIER_PATTERNS = [
  /(?:^|[\s;}])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g,
  /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\/\/\/\s*<reference\s+types=["']([^"']+)["']/g,
  /@import\s+(?:url\()?["']([^"']+)["']/g,
];

/**
 * Reduces a module specifier to the package that must be declared for it, or null
 * when nothing needs declaring: relative paths, the `@/` source alias, `node:`
 * builtins, and Vite's `virtual:` modules.
 */
export function packageOfSpecifier(specifier) {
  if (/^[./]/.test(specifier) || specifier.startsWith("@/")) return null;
  if (specifier.startsWith("node:") || specifier.startsWith("virtual:")) return null;
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

/** Collects every scannable file under a directory, skipping build and vendor output. */
async function sourceFiles(directory, collected = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await sourceFiles(full, collected);
    else if (SCANNED.has(path.extname(entry.name))) collected.push(full);
  }
  return collected;
}

/** The set of packages imported by the files of one workspace package. */
export async function importedPackages(files) {
  const imported = new Set();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const pattern of SPECIFIER_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        const name = packageOfSpecifier(match[1]);
        if (name) imported.add(name);
      }
    }
  }
  return imported;
}

/**
 * The manifests this gate governs: the workspace root, whose only source is
 * `scripts/`, and every package under `packages/`.
 */
async function manifests(root) {
  const packagesDir = path.join(root, "packages");
  const names = (await readdir(packagesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const entries = [
    { label: "package.json", dir: root, scan: [path.join(root, "scripts")] },
    ...names.map((name) => ({
      label: `packages/${name}/package.json`,
      dir: path.join(packagesDir, name),
      scan: [path.join(packagesDir, name)],
    })),
  ];
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      manifest: JSON.parse(await readFile(path.join(entry.dir, "package.json"), "utf8")),
    })),
  );
}

/**
 * Asserts the release-age quarantine is switched on.
 *
 * `pnpm-workspace.yaml` carried a `minimumReleaseAgeExclude` list for nine versions
 * before it carried the setting that list excepts, so the exceptions were live and
 * the window was not. A quarantine that silently reverts to zero is the failure this
 * one line prevents (ADR 29 § Observed consequences).
 */
async function checkQuarantine(root, errors) {
  const source = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const declared = source.match(/^minimumReleaseAge:\s*(\d+)\s*$/m);
  if (!declared || Number(declared[1]) <= 0) {
    errors.push(
      "pnpm-workspace.yaml must set a positive `minimumReleaseAge` (minutes). Without it the " +
        "`minimumReleaseAgeExclude` list below it excepts a rule that is not running (ADR 29).",
    );
  }
}

/** Validates every declared dependency against the allow-list and against real use. */
export async function checkDependencies(root = ROOT) {
  const errors = [];
  await checkQuarantine(root, errors);

  for (const [name, entry] of Object.entries(ALLOWED)) {
    if (!KINDS.has(entry.kind))
      errors.push(`Allow-list entry ${name} has unknown kind ${entry.kind}.`);
    if (!entry.why?.trim()) errors.push(`Allow-list entry ${name} must state why it is here.`);
  }

  const declaredSomewhere = new Set();
  for (const { label, manifest, scan } of await manifests(root)) {
    const declared = { ...manifest.dependencies, ...manifest.devDependencies };
    const files = (await Promise.all(scan.map((dir) => sourceFiles(dir)))).flat();
    const imported = await importedPackages(files);

    for (const [name, specifier] of Object.entries(declared)) {
      if (specifier.startsWith("workspace:")) continue;
      declaredSomewhere.add(name);
      const entry = ALLOWED[name];
      if (!entry) {
        errors.push(
          `${label} declares ${name}, which is not on the allow-list in scripts/checkDependencies.mjs. ` +
            "Add it there with one line saying why a native API or an existing repository helper " +
            "does not do the job, or remove the dependency (ADR 29).",
        );
        continue;
      }
      if (entry.kind === "import" && !imported.has(name)) {
        errors.push(
          `${label} declares ${name} but nothing in that package imports it. Remove it, or change ` +
            "its allow-list kind if it is genuinely used by a command or a config string (ADR 29).",
        );
      }
    }

    for (const name of imported) {
      if (name in declared || name.startsWith("@fleet/")) continue;
      errors.push(
        `${label}'s package imports ${name} without declaring it. A dependency resolved through ` +
          "hoisting disappears the moment another package drops it (ADR 29).",
      );
    }
  }

  for (const name of Object.keys(ALLOWED)) {
    if (!declaredSomewhere.has(name)) {
      errors.push(
        `${name} is on the allow-list but no package declares it. An allow-list entry with no ` +
          "dependency behind it pre-approves a future addition nobody reviewed (ADR 29).",
      );
    }
  }

  return errors;
}

async function main() {
  const errors = await checkDependencies();
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  console.log(
    `Dependencies are vetted: ${String(Object.keys(ALLOWED).length)} allow-list entries, all declared and all used.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
