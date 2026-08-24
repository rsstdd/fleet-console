import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADR_DIR = path.join(ROOT, "docs", "00_adr");
const MAP_PATH = path.join(ROOT, "docs", "decisions.json");
const REGISTER_PATH = path.join(ROOT, "docs", "PENDING_ARCHITECTURE_DECISIONS.md");

/** Parses the required title, decision, and status metadata from one normative ADR. */
export function parseAdrMetadata(source, file) {
  const title = source.match(/^# ADR (\d+) — (.+)$/m);
  const decision = source.match(/^\*\*Decision:\*\* (.+)$/m);
  const status = source.match(
    /^\*\*Status:\*\* (Decided|Superseded) · (\d{4}-\d{2}-\d{2}) · (Implemented|Partial|Not started)(?: .*)?$/m,
  );
  if (!title || !decision || !status) {
    throw new Error(`${file}: ADR metadata must match the template exactly.`);
  }
  const supersededBy = source.match(/^\*\*Superseded by:\*\* ADR (\d+)$/m);
  if (status[1] === "Superseded" && !supersededBy) {
    throw new Error(`${file}: a Superseded ADR must declare **Superseded by:** ADR N.`);
  }
  if (status[1] === "Decided" && supersededBy) {
    throw new Error(`${file}: only a Superseded ADR may declare **Superseded by:**.`);
  }
  return {
    number: Number(title[1]),
    title: title[2],
    decision: decision[1],
    state: status[1],
    date: status[2],
    implementation: status[3],
    supersededBy: supersededBy ? Number(supersededBy[1]) : null,
    file,
  };
}

/** Parses lifecycle metadata from one executable planning document. */
export function parsePlanMetadata(source, file) {
  const authority = /^\*\*Authority:\*\* Planning only\./m.test(source);
  const status = source.match(/^\*\*Status:\*\* (Active|Blocked|Trigger-deferred)$/m);
  const updated = source.match(/^\*\*Updated:\*\* (\d{4}-\d{2}-\d{2})$/m);
  if (!authority || !status || !updated) {
    throw new Error(
      `${file}: plan metadata must declare Planning only authority, Status, and Updated date.`,
    );
  }
  const trigger = source.match(/^\*\*Trigger:\*\* (.+)$/m)?.[1] ?? null;
  const blocker = source.match(/^\*\*Blocker:\*\* (.+)$/m)?.[1] ?? null;
  if (status[1] === "Trigger-deferred" && !trigger) {
    throw new Error(`${file}: a Trigger-deferred plan must declare **Trigger:**.`);
  }
  if (status[1] === "Blocked" && !blocker) {
    throw new Error(`${file}: a Blocked plan must declare **Blocker:**.`);
  }
  if (status[1] !== "Trigger-deferred" && trigger) {
    throw new Error(`${file}: only a Trigger-deferred plan may declare **Trigger:**.`);
  }
  if (status[1] !== "Blocked" && blocker) {
    throw new Error(`${file}: only a Blocked plan may declare **Blocker:**.`);
  }
  return { status: status[1], updated: updated[1], trigger, file };
}

/** Loads every current plan and rejects files without executable lifecycle metadata. */
export async function loadPlans(root = ROOT) {
  const directory = path.join(root, "docs", "05_plans");
  const files = (await readdir(directory)).filter(
    (file) => file.endsWith(".md") && file !== "00_TEMPLATE.md",
  );
  return Promise.all(
    files.map(async (file) =>
      parsePlanMetadata(await readFile(path.join(directory, file), "utf8"), file),
    ),
  );
}

/** Validates durable decision identifiers and open-versus-resolved routing fields. */
export function validateDecisionRouting(decisions) {
  const errors = [];
  const routed = new Set();
  const normativeAdrs = new Set();
  for (const [index, entry] of decisions.entries()) {
    if (entry.id !== `D${index + 1}`) {
      errors.push(
        `Decision routing must be contiguous; expected D${index + 1}, found ${entry.id}.`,
      );
    }
    if (routed.has(entry.id)) errors.push(`${entry.id} appears more than once in decisions.json.`);
    routed.add(entry.id);
    if (entry.adr !== null) {
      if ("next" in entry) {
        errors.push(`${entry.id} is resolved and must remove its open-stub next step.`);
      }
      if (normativeAdrs.has(entry.adr)) {
        errors.push(`ADR ${entry.adr} is routed from more than one durable decision.`);
      }
      normativeAdrs.add(entry.adr);
    } else if (typeof entry.next !== "string" || entry.next.trim() === "") {
      errors.push(`${entry.id} is open and must declare a non-empty next step.`);
    }
  }
  return errors;
}

/** Loads every numbered ADR and rejects duplicate ADR numbers. */
export async function loadAdrs(root = ROOT) {
  const directory = path.join(root, "docs", "00_adr");
  const files = (await readdir(directory)).filter(
    (file) => /^[0-9]{2}_.+\.md$/.test(file) && file !== "00_TEMPLATE.md",
  );
  const entries = await Promise.all(
    files.map(async (file) =>
      parseAdrMetadata(await readFile(path.join(directory, file), "utf8"), file),
    ),
  );
  const byNumber = new Map();
  for (const entry of entries) {
    if (byNumber.has(entry.number)) throw new Error(`ADR ${entry.number} is duplicated.`);
    byNumber.set(entry.number, entry);
  }
  return byNumber;
}

/** Renders the generated short decision index and tombstone list. */
export function renderRegister(decisionMap, adrs) {
  const rows = decisionMap.decisions.map((entry) => {
    if (entry.adr === null) {
      return [entry.id, "Open", "—", entry.question];
    }
    const adr = adrs.get(entry.adr);
    if (!adr) throw new Error(`${entry.id} points to missing ADR ${entry.adr}.`);
    return [
      entry.id,
      adr.implementation,
      `[ADR ${entry.adr}](./00_adr/${adr.file})`,
      entry.question,
    ];
  });
  const headings = ["ID", "Status", "Normative record", "Question"];
  const widths = headings.map((heading, index) =>
    Math.max(heading.length, 3, ...rows.map((row) => row[index].length)),
  );
  const tableRow = (cells) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  const divider = `| ${widths.map((width) => "-".repeat(Math.max(3, width))).join(" | ")} |`;
  const open = decisionMap.decisions.filter((entry) => entry.adr === null);
  // Every stub resolved is the expected end state, not a generator bug. A bare heading
  // reads like truncated output, so say so explicitly (ADR 26 closed the last one).
  const openLines =
    open.length === 0
      ? [
          `None. Every stub D1–${decisionMap.decisions.at(-1).id} routes to a numbered ADR; see the table above for each one's implementation status.`,
        ]
      : open.flatMap((entry) => [`### ${entry.id} — ${entry.question}`, "", entry.next, ""]);
  return (
    [
      "<!-- GENERATED by `pnpm docs:decisions`. Do not edit by hand. -->",
      "",
      "# Architecture decision index",
      "",
      "**Authority:** Index only. Numbered ADRs are the sole normative decision records.",
      "",
      "This file is intentionally short: resolved entries are tombstones linking to their ADR; only unresolved stubs carry a next step.",
      "",
      tableRow(headings),
      divider,
      ...rows.map(tableRow),
      "",
      "## Open stubs",
      "",
      ...openLines,
    ].join("\n") + "\n"
  );
}

/** Validates decision routing, citations, generated output, and stale authority language. */
export async function checkArchitectureDocs(root = ROOT) {
  const decisionMap = JSON.parse(await readFile(path.join(root, "docs", "decisions.json"), "utf8"));
  const adrs = await loadAdrs(root);
  const errors = [];
  try {
    await loadPlans(root);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  errors.push(...validateDecisionRouting(decisionMap.decisions));
  for (const adr of adrs.values()) {
    if (adr.state === "Superseded") {
      const replacement = adrs.get(adr.supersededBy);
      if (!replacement) {
        errors.push(`${adr.file} points to missing replacement ADR ${adr.supersededBy}.`);
      } else if (replacement.number === adr.number) {
        errors.push(`${adr.file} cannot supersede itself.`);
      }
    }
  }
  // The registration is the whole path → ADR record. Requiring the file to also spell the
  // number out gave the same fact two homes, and the renumbering that turned ADR 27 into 28
  // had to chase it through seven files. Sole ownership is only worth having if both halves
  // are checked: the path, which a registry alone cannot know exists, and the number, which
  // no longer has a comment anywhere to contradict it if it routes nowhere.
  for (const rule of decisionMap.mechanicalRules) {
    try {
      await access(path.join(root, rule.path));
    } catch {
      errors.push(
        `${rule.path} is registered as an ADR ${rule.adr} enforcement file but is missing.`,
      );
    }
    if (!adrs.has(rule.adr)) {
      errors.push(`${rule.path} is registered under ADR ${rule.adr}, which does not exist.`);
    }
  }
  for (const [authority, paths] of Object.entries(decisionMap.authorityMarkers)) {
    for (const markedPath of paths) {
      try {
        const source = await readFile(path.join(root, markedPath), "utf8");
        const expectedMarker = `**Authority:** ${authority}`;
        if (!source.slice(0, 600).toLowerCase().includes(expectedMarker.toLowerCase())) {
          errors.push(`${markedPath} must declare ${expectedMarker} near the top.`);
        }
      } catch {
        errors.push(`${markedPath} is registered as ${authority} but is missing.`);
      }
    }
  }
  const expected = await prettier.format(renderRegister(decisionMap, adrs), {
    parser: "markdown",
  });
  const actual = await readFile(
    path.join(root, "docs", "PENDING_ARCHITECTURE_DECISIONS.md"),
    "utf8",
  );
  if (actual !== expected) errors.push("Decision index is stale; run `pnpm docs:decisions`.");

  const resolvedIds = decisionMap.decisions
    .filter((entry) => entry.adr !== null)
    .map((entry) => entry.id);
  const authoritative = ["AGENTS.md", "README.md", "PRINCIPLES.md", "docs/03_package-specs"];
  const files = [];
  for (const candidate of authoritative) {
    const absolute = path.join(root, candidate);
    if (candidate.endsWith(".md")) files.push(absolute);
    else {
      for (const file of await readdir(absolute))
        if (file.endsWith(".md")) files.push(path.join(absolute, file));
    }
  }
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/^\*\*D\d+ is (?:settled|resolved)/m.test(source)) {
      errors.push(
        `${path.relative(root, file)} repeats decision status; summarize consequences and link the ADR instead.`,
      );
    }
    for (const id of resolvedIds) {
      const stale = new RegExp(
        `\\b${id}\\b[^\\n]{0,80}\\b(pending|open|unratified|not implemented|not built)\\b`,
        "i",
      );
      if (stale.test(source))
        errors.push(`${path.relative(root, file)} describes resolved ${id} as unresolved.`);
    }
  }
  return errors;
}

async function main() {
  const decisionMap = JSON.parse(await readFile(MAP_PATH, "utf8"));
  const adrs = await loadAdrs();
  if (process.argv.includes("--write")) {
    const register = await prettier.format(renderRegister(decisionMap, adrs), {
      parser: "markdown",
    });
    await writeFile(REGISTER_PATH, register);
    return;
  }
  const errors = await checkArchitectureDocs();
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  console.log("Architecture documentation is consistent.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
