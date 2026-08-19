// The console's first-load budget, and the check that fails a build which exceeds it.
//
// Principle 12 asks for budgets. Register D17 asked which of this repository's
// numbers are decisions and which are placeholders, and ADR 22 answered: gate the
// numbers whose failure a human notices, report the rest. This is the gate.
//
// THE DERIVATION (ADR 22 § Argument). A budget with no derivation is the gate
// that gets raised the first time it fails, so the numbers below are stated as a
// consequence of a named device on a named network, and moving them means
// changing that claim in the open.
//
//   Target: a warehouse-floor tablet — mid-tier ARM, roughly 2020 Android tablet
//   class — on shared site Wi-Fi delivering ~3 Mbps effective (375 kB/s) while
//   the fleet is also using it. This is the machine an operator opens the
//   console on, not the machine it is built on.
//
//   Goal: 2.0 s from navigation to the fleet table showing its first data, split
//     1.0 s transfer + 0.6 s parse/compile/execute + 0.4 s for connection setup,
//     first paint and the first socket message.
//
//   Transfer: 375 kB/s x 1.0 s = 375 kB compressed. First paint requests three
//     latin font subsets (sans 400, sans 500, mono 400) at 61.5 kB of woff2,
//     which is already compressed and does not shrink again on the wire.
//     375 - 61.5 ~= 313, taken down to 300 kB for request overhead.
//     => GZIP_BUDGET_KB = 300, for JS + CSS.
//
//   Parse/compile: ~1.2 MB/s of raw JavaScript is a conservative rate for that
//     device class. 1.2 MB/s x 0.6 s = 720 kB.
//     => RAW_BUDGET_KB = 720, for JS + CSS.
//
// Raw is the binding constraint at today's size, which is the honest outcome:
// on a low-end device the console is limited by the JavaScript it has to compile,
// not by the bytes it has to fetch.
//
// WHAT THIS GATE IS FOR. It stops a step change — a charting library, a second
// icon set, a map SDK pulled in whole — not a kilobyte of drift. The slide is
// carried by the reported number, which CI prints on every run and which
// `README.md` § 10 records.
//
// Coupling: `packages/contracts/TODO.md` C-5 measured Zod's cost to this bundle
// and asked for a budget to hold it against; this file is that budget. ADR 22
// owns both numbers, and `docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md`
// owns the other gate this decision kept.
import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ASSETS_DIR = path.join(process.cwd(), "packages", "web", "dist", "assets");

/** Compressed budget for the code the console loads before it can render, in kB. */
const GZIP_BUDGET_KB = 300;

/** Uncompressed budget for that same code — the parse/compile constraint, in kB. */
const RAW_BUDGET_KB = 720;

/** Extensions the budget covers: the code, not the fonts it renders with. */
const BUDGETED = new Set([".js", ".css"]);

/**
 * Fonts are measured and printed but not budgeted: they are served with
 * unicode-range subsets, so summing every emitted file counts bytes no first
 * load ever fetches, and the three subsets a first paint does fetch are already
 * inside the transfer arithmetic above.
 */
const FONTS = new Set([".woff", ".woff2"]);

const kb = (bytes) => bytes / 1000;
const fmt = (bytes) => `${kb(bytes).toFixed(2)} kB`;

async function measure() {
  let entries;
  try {
    entries = await readdir(ASSETS_DIR);
  } catch {
    throw new Error(`No build to measure at ${ASSETS_DIR}. Run \`pnpm --filter web build\` first.`);
  }

  const totals = { raw: 0, gzip: 0, fontBytes: 0, files: [] };
  for (const entry of entries.sort()) {
    const extension = path.extname(entry);
    if (!BUDGETED.has(extension) && !FONTS.has(extension)) continue;

    const bytes = await readFile(path.join(ASSETS_DIR, entry));
    if (FONTS.has(extension)) {
      totals.fontBytes += bytes.byteLength;
      continue;
    }

    const gzip = gzipSync(bytes, { level: 9 }).byteLength;
    totals.raw += bytes.byteLength;
    totals.gzip += gzip;
    totals.files.push({ entry, raw: bytes.byteLength, gzip });
  }

  if (totals.files.length === 0) {
    throw new Error(
      `No .js or .css assets under ${ASSETS_DIR}; the build produced nothing to gate.`,
    );
  }
  return totals;
}

const totals = await measure();

// Reported, per ADR 22: the number is visible on every run whether or not it fails.
for (const file of totals.files) {
  console.log(`  ${file.entry.padEnd(28)} ${fmt(file.raw).padStart(11)}  gzip ${fmt(file.gzip)}`);
}
console.log(`  ${"fonts (not budgeted)".padEnd(28)} ${fmt(totals.fontBytes).padStart(11)}`);
console.log(
  `\nfirst-load code: ${fmt(totals.raw)} raw / ${fmt(totals.gzip)} gzip` +
    `  (budget ${RAW_BUDGET_KB} kB raw / ${GZIP_BUDGET_KB} kB gzip)`,
);

const failures = [];
if (kb(totals.raw) > RAW_BUDGET_KB) {
  failures.push(`raw ${fmt(totals.raw)} exceeds the ${RAW_BUDGET_KB} kB parse/compile budget`);
}
if (kb(totals.gzip) > GZIP_BUDGET_KB) {
  failures.push(`gzip ${fmt(totals.gzip)} exceeds the ${GZIP_BUDGET_KB} kB transfer budget`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`::error::Bundle budget exceeded: ${failure} (ADR 22).`);
  }
  console.error(
    "\nThis budget is derived from a warehouse tablet on shared site Wi-Fi (see the header of\n" +
      "this file). Raising it is a claim that the operator's device or network is different from\n" +
      "the one stated there — make that argument in ADR 22, or make the console smaller.",
  );
  process.exit(1);
}
