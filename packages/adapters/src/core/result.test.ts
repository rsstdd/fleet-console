import { describe, expect, it } from "vitest";

import { toContractIssues } from "@fleet/contracts";
import { z } from "zod";

import { failure, isOk, issuesForKind, ok, type AdapterResult } from "./result.ts";

describe("adapter result", () => {
  it("narrows to the decoded value on success", () => {
    const result: AdapterResult<number> = ok(42);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) throw new Error("expected success");
    expect(result.value).toBe(42);
  });

  it("carries a structured rejection instead of throwing vendor data across the boundary", () => {
    const result: AdapterResult<number> = failure({
      kind: "unmappable_value",
      vendor: "B",
      issues: issuesForKind(
        "unmappable_value",
        "status",
        "vendor status code has no honest canonical mapping",
      ),
    });

    expect(isOk(result)).toBe(false);
    if (isOk(result)) throw new Error("expected failure");
    expect(result.error.kind).toBe("unmappable_value");
    expect(result.error.vendor).toBe("B");
    expect(result.error.issues).toEqual([
      {
        path: "status",
        code: "unmappable_value",
        message: "vendor status code has no honest canonical mapping",
      },
    ]);
  });

  it("keeps every issue a vendor schema produced, rather than flattening to one message", () => {
    // ADR 20: the reason the error carries issues at all. A payload wrong in two
    // places must still be wrong in two places by the time the server counts it
    // and the console renders it.
    const schema = z.looseObject({ battery: z.number(), robot_id: z.string() });
    const parsed = schema.safeParse({ battery: "88%", robot_id: 4 });
    if (parsed.success) throw new Error("expected a failure");

    const result: AdapterResult<never> = failure({
      kind: "malformed_payload",
      vendor: "B",
      issues: toContractIssues(parsed.error),
    });

    if (isOk(result)) throw new Error("expected failure");
    expect(result.error.issues.map((issue) => issue.path)).toEqual(["battery", "robot_id"]);
    expect(result.error.issues.every((issue) => issue.code === "invalid_type")).toBe(true);
  });
});
