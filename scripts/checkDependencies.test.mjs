import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { checkDependencies, importedPackages, packageOfSpecifier } from "./checkDependencies.mjs";

/**
 * Builds a throwaway workspace carrying one instance of each violation.
 *
 * The gate is only worth its CI minute if it fails on a tree that breaks the rule,
 * and asserting that against the real repository is impossible without breaking the
 * real repository. This fixture is the falsifier (Principle 15, ADR 22).
 */
async function fixtureWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "fleet-deps-"));
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "packages", "thing", "src"), { recursive: true });

  // No `minimumReleaseAge`, exactly as this repository stood before ADR 29.
  await writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    'packages:\n  - "packages/*"\nminimumReleaseAgeExclude:\n  - "vitest@4.1.11"\n',
  );
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture-root" }));
  await writeFile(
    path.join(root, "packages", "thing", "package.json"),
    JSON.stringify({
      name: "@fixture/thing",
      dependencies: { "left-pad": "^1.3.0", zod: "^4.4.3" },
    }),
  );
  // Declares zod without importing it, and imports a package it never declared.
  await writeFile(
    path.join(root, "packages", "thing", "src", "index.ts"),
    'import { parse } from "yaml";\nexport const run = () => parse("");\n',
  );
  return root;
}

test("a specifier resolves to the package that must be declared for it", () => {
  assert.equal(packageOfSpecifier("@mui/material/Button"), "@mui/material");
  assert.equal(packageOfSpecifier("vitest"), "vitest");
  assert.equal(packageOfSpecifier("vite/client"), "vite");
  for (const local of ["./sibling", "../core/thing", "@/shared/ui", "node:fs", "virtual:uno"]) {
    assert.equal(packageOfSpecifier(local), null, `${local} needs no declaration`);
  }
});

test("every syntactic form that names a package is seen", async () => {
  const root = await fixtureWorkspace();
  const file = path.join(root, "packages", "thing", "src", "forms.ts");
  // Each form is assembled rather than written out, because this file lives under
  // `scripts/` and the checker scans `scripts/` as the root package's source. A
  // literal `from "alpha"` here would be a phantom import of alpha in this very
  // repository — the checker reporting its own test fixture, which it did.
  const forms = (name) => [
    `import a from ${JSON.stringify(name)};`,
    `export { b } from ${JSON.stringify(name)};`,
    `import ${JSON.stringify(name)};`,
    `const d = require(${JSON.stringify(name)});`,
    `const e = await import(${JSON.stringify(name)});`,
    `/// <reference types=${JSON.stringify(name)} />`,
    `@import ${JSON.stringify(`${name}/index.css`)};`,
  ];
  const names = ["alpha", "@golf/hotel"];
  await writeFile(file, names.flatMap(forms).join("\n"));

  const found = await importedPackages([file]);
  assert.deepEqual([...found].sort(), ["@golf/hotel", "alpha"]);
});

test("the gate fails on an unvetted, an unused, and an undeclared dependency", async () => {
  const errors = await checkDependencies(await fixtureWorkspace());
  const fires = (fragment) => errors.some((error) => error.includes(fragment));

  assert.ok(fires("left-pad, which is not on the allow-list"), "unvetted package is rejected");
  assert.ok(fires("declares zod but nothing in that package imports it"), "unused is rejected");
  assert.ok(fires("imports yaml without declaring it"), "phantom import is rejected");
  assert.ok(fires("must set a positive `minimumReleaseAge`"), "a disarmed quarantine is rejected");
});

test("this repository's own dependencies are vetted, declared, and used", async () => {
  assert.deepEqual(await checkDependencies(), []);
});
