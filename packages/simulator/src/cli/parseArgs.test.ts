import { describe, expect, it } from "vitest";

import { DEFAULTS, MAX_HZ } from "../config/simulatorConfig.ts";
import { ENV_KEYS, parseArgs } from "./parseArgs.ts";

/** Narrows to the success branch, failing with the actual message when it is not. */
function config(argv: string[], env: Record<string, string> = {}) {
  const result = parseArgs(argv, env);
  if (result.kind !== "config") {
    throw new Error(`expected config, got ${result.kind}: ${JSON.stringify(result)}`);
  }
  return result.config;
}

/** Narrows to the error branch and returns the operator-facing message. */
function errorMessage(argv: string[], env: Record<string, string> = {}): string {
  const result = parseArgs(argv, env);
  if (result.kind !== "error") {
    throw new Error(`expected error, got ${result.kind}`);
  }
  return result.message;
}

describe("parseArgs defaults", () => {
  it("runs the documented demo workload with no arguments", () => {
    expect(config([])).toMatchObject({
      robots: DEFAULTS.robots,
      hz: DEFAULTS.hz,
      seed: DEFAULTS.seed,
      endpoint: DEFAULTS.endpoint,
      droppedRobotIds: [],
      printManifest: false,
    });
  });
});

describe("parseArgs valid flags", () => {
  it("accepts the documented load profile", () => {
    expect(config(["--robots", "500", "--hz", "5"])).toMatchObject({ robots: 500, hz: 5 });
  });

  it("accepts a fractional rate, since --hz is per robot and may be slower than 1 Hz", () => {
    expect(config(["--hz", "0.5"]).hz).toBe(0.5);
  });

  it("accepts every remaining option", () => {
    expect(
      config([
        "--seed",
        "99",
        "--endpoint",
        "http://example.test:9000",
        "--timeout",
        "500",
        "--max-in-flight",
        "8",
        "--retries",
        "3",
        "--summary",
        "1000",
      ]),
    ).toMatchObject({
      seed: 99,
      endpoint: "http://example.test:9000",
      timeoutMs: 500,
      maxInFlight: 8,
      maxRetries: 3,
      summaryIntervalMs: 1000,
    });
  });

  it("treats --print-manifest as a flag with no value", () => {
    expect(config(["--print-manifest", "--robots", "3"])).toMatchObject({
      printManifest: true,
      robots: 3,
    });
  });

  it("lets a later flag win over an earlier one", () => {
    expect(config(["--robots", "10", "--robots", "20"]).robots).toBe(20);
  });
});

describe("parseArgs --drop", () => {
  it("parses the README's comma-separated example", () => {
    expect(config(["--drop", "R-204,R-087,R-301"]).droppedRobotIds).toEqual([
      "R-087",
      "R-204",
      "R-301",
    ]);
  });

  it("accepts the flag repeated and merges the sets", () => {
    expect(config(["--drop", "R-001", "--drop", "R-002"]).droppedRobotIds).toEqual([
      "R-001",
      "R-002",
    ]);
  });

  it("trims whitespace around identifiers", () => {
    expect(config(["--drop", " R-001 , R-002 "]).droppedRobotIds).toEqual(["R-001", "R-002"]);
  });

  it("collapses duplicates rather than dropping a robot twice", () => {
    expect(config(["--drop", "R-001,R-001", "--drop", "R-001"]).droppedRobotIds).toEqual(["R-001"]);
  });

  it("ignores empty entries from a trailing comma", () => {
    expect(config(["--drop", "R-001,"]).droppedRobotIds).toEqual(["R-001"]);
  });
});

describe("parseArgs environment", () => {
  it("reads the endpoint and seed from the environment", () => {
    expect(
      config([], { [ENV_KEYS.endpoint]: "http://env.test:1234", [ENV_KEYS.seed]: "42" }),
    ).toMatchObject({ endpoint: "http://env.test:1234", seed: 42 });
  });

  it("lets a flag override the environment", () => {
    expect(
      config(["--endpoint", "http://flag.test"], { [ENV_KEYS.endpoint]: "http://env.test" })
        .endpoint,
    ).toBe("http://flag.test");
  });

  it("validates environment values rather than trusting the string", () => {
    expect(errorMessage([], { [ENV_KEYS.endpoint]: "not-a-url" })).toContain(ENV_KEYS.endpoint);
    expect(errorMessage([], { [ENV_KEYS.seed]: "abc" })).toContain(ENV_KEYS.seed);
  });
});

describe("parseArgs rejections", () => {
  it("names the option and its accepted range", () => {
    expect(errorMessage(["--robots", "0"])).toContain("--robots must be between 1 and 5000");
    expect(errorMessage(["--hz", "0"])).toContain("--hz must be greater than 0");
    expect(errorMessage(["--hz", String(MAX_HZ + 1)])).toContain(
      `--hz must not exceed ${String(MAX_HZ)}`,
    );
  });

  it.each([
    ["--robots", "abc"],
    ["--robots", "1.5"],
    ["--robots", "Infinity"],
    ["--robots", "NaN"],
    ["--robots", "-5"],
    ["--hz", "abc"],
    ["--hz", "-1"],
    ["--hz", "Infinity"],
    ["--seed", "-1"],
    ["--timeout", "0"],
    ["--max-in-flight", "0"],
    ["--retries", "11"],
    ["--summary", "1"],
  ])("rejects %s %s", (flag, value) => {
    expect(errorMessage([flag, value])).toContain(flag);
  });

  it("rejects a flag whose value is missing", () => {
    expect(errorMessage(["--robots"])).toBe("--robots expects a value.");
  });

  it("rejects a flag followed by another flag rather than swallowing it", () => {
    expect(errorMessage(["--robots", "--hz", "5"])).toBe("--robots expects a value.");
  });

  it("rejects an unknown option and points at --help", () => {
    expect(errorMessage(["--turbo"])).toBe(
      "Unknown option --turbo. Run with --help for the accepted options.",
    );
  });

  it("rejects a non-http endpoint scheme", () => {
    expect(errorMessage(["--endpoint", "ftp://example.test"])).toContain("http or https");
  });

  it("returns messages without a stack trace", () => {
    expect(errorMessage(["--robots", "0"])).not.toContain("    at ");
  });
});

describe("parseArgs --help", () => {
  it("returns help text rather than a config, so nothing starts", () => {
    const result = parseArgs(["--help"]);
    expect(result.kind).toBe("help");
  });

  it("accepts -h and wins over any other flag", () => {
    expect(parseArgs(["--robots", "10", "-h"]).kind).toBe("help");
  });

  it("documents every accepted flag", () => {
    const result = parseArgs(["--help"]);
    if (result.kind !== "help") {
      throw new Error("expected help");
    }
    for (const flag of [
      "--robots",
      "--hz",
      "--seed",
      "--drop",
      "--endpoint",
      "--timeout",
      "--max-in-flight",
      "--retries",
      "--summary",
      "--print-manifest",
      "--help",
    ]) {
      expect(result.text).toContain(flag);
    }
  });

  it("states that --hz is per robot, which is the flag most easily misread", () => {
    const result = parseArgs(["--help"]);
    if (result.kind !== "help") {
      throw new Error("expected help");
    }
    expect(result.text).toContain("PER ROBOT");
  });
});

describe("VALUE_FLAGS and the parse switch agree", () => {
  it("accepts a value for every flag the help text documents as taking one", () => {
    // Guards the duplication between VALUE_FLAGS and the switch: a flag added to
    // one and not the other would either be rejected as unknown or fall through
    // to the unreachable default.
    const sample: Record<string, string> = {
      "--robots": "10",
      "--hz": "2",
      "--seed": "3",
      "--drop": "R-001",
      "--endpoint": "http://example.test",
      "--timeout": "100",
      "--max-in-flight": "4",
      "--retries": "1",
      "--summary": "500",
    };
    for (const [flag, value] of Object.entries(sample)) {
      expect(parseArgs([flag, value]).kind, `${flag} should parse`).toBe("config");
    }
  });
});

/**
 * `pnpm start -- --flag` forwards the separator itself, so the CLI has to
 * tolerate it. This is not a hypothetical: the command in the package README
 * failed on it, which meant the documented roster handoff could not be followed
 * as written (ADR 14 § Observed consequences).
 */
describe("the pnpm-forwarded `--` separator", () => {
  it("is skipped rather than rejected as an unknown option", () => {
    const parsed = parseArgs(["--", "--print-manifest"], {});

    expect(parsed.kind).toBe("config");
    if (parsed.kind !== "config") return;
    expect(parsed.config.printManifest).toBe(true);
  });

  it("does not swallow the flag that follows it", () => {
    const parsed = parseArgs(["--", "--robots", "7"], {});

    expect(parsed.kind).toBe("config");
    if (parsed.kind !== "config") return;
    expect(parsed.config.robots).toBe(7);
  });

  it("still rejects a genuinely unknown option", () => {
    const parsed = parseArgs(["--", "--turbo"], {});

    expect(parsed.kind).toBe("error");
  });
});
