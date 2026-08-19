import { describe, expect, it } from "vitest";
import { z } from "zod";

import { failure, isOk, issuesForKind, type AdapterResult } from "@fleet/adapters";
import {
  ADAPTER_ERROR_KINDS,
  ERROR_KINDS,
  SCHEMA_VERSION,
  parseErrorEnvelope,
  toContractIssues,
} from "@fleet/contracts";

import { errorResponse, errorResponseForAdapterError } from "./errorResponse.ts";

/** A vendor-shaped payload rejected in two places at once, with distinctive values. */
const VENDOR_SECRET = "sk-live-9d21-do-not-leak";

/** Stands in for a vendor dialect schema until B1–B3 land. */
const vendorSchema = z.looseObject({
  robot_id: z.string(),
  battery_pct: z.number(),
  api_token: z.string().max(4),
});

/** The adapter failure a malformed vendor payload produces. */
function malformedFailure(): AdapterResult<never> {
  const parsed = vendorSchema.safeParse({
    robot_id: 7,
    battery_pct: "88%",
    api_token: VENDOR_SECRET,
  });
  if (parsed.success) throw new Error("expected a failure");

  return failure({
    kind: "malformed_payload",
    vendor: "B",
    issues: toContractIssues(parsed.error),
  });
}

describe("errorResponse", () => {
  it("returns a body every consumer can decode", () => {
    const { body } = errorResponse("malformed_payload", [
      { path: "battery_pct", code: "invalid_type", message: "Invalid input" },
    ]);

    const decoded = parseErrorEnvelope(JSON.parse(JSON.stringify(body)));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.schemaVersion).toBe(SCHEMA_VERSION);
    expect(decoded.value.error.issues[0]?.path).toBe("battery_pct");
  });

  it("gives every kind a status and a summary", () => {
    // Exhaustive over the contracts vocabulary: a kind added there fails here
    // until this server has decided what to answer with (ADR 20).
    for (const kind of ERROR_KINDS) {
      const { status, body } = errorResponse(kind);

      expect([400, 404, 413, 500]).toContain(status);
      expect(body.error.message.length).toBeGreaterThan(0);
      expect(body.error.kind).toBe(kind);
    }
  });

  it("answers an oversized body with 413, not the generic bad-payload 400", () => {
    // The caller's remedy differs in kind — send less, rather than send it correctly —
    // and nothing read the body, so the server has no opinion on whether it was
    // well-formed (ADR 26).
    const { status, body } = errorResponse("payload_too_large");

    expect(status).toBe(413);
    expect(body.error.kind).toBe("payload_too_large");
  });

  it("states the limit exists without quoting anything from the request", () => {
    // G6: no vendor payload content may reach an error body. The summary is a fixed
    // string, so there is nothing derived from the request to leak.
    const { body } = errorResponse("payload_too_large");

    expect(body.error.message).toContain("size limit");
    expect(body.error.issues).toEqual([]);
  });

  it("separates an unintegrated vendor from a bad payload, as ADR 8 requires", () => {
    expect(errorResponse("unsupported_vendor").status).toBe(404);
    expect(errorResponse("malformed_payload").status).toBe(400);
  });

  it("carries an empty issue list when the failure is not field-scoped", () => {
    expect(errorResponse("not_found").body.error.issues).toEqual([]);
  });
});

describe("errorResponseForAdapterError", () => {
  it("copies the adapter's kind and issues instead of re-deriving them", () => {
    // The property the decision turns on. Per-field detail exists at the
    // adapter; this asserts it is still there in the response body, which is
    // where option 2's re-derivation would have lost it (ADR 20).
    const rejected = malformedFailure();
    if (isOk(rejected)) throw new Error("expected failure");

    const { status, body } = errorResponseForAdapterError(rejected.error);

    expect(status).toBe(400);
    expect(body.error.kind).toBe(rejected.error.kind);
    expect(body.error.issues).toEqual(rejected.error.issues);
    expect(body.error.issues.map((issue) => issue.path)).toEqual([
      "robot_id",
      "battery_pct",
      "api_token",
    ]);
  });

  it("leaks no vendor payload content into the response body", () => {
    // packages/server G6. The guarantee is structural: a ContractIssue holds a
    // path, a category and a schema-derived message, and never a rejected
    // value — so serializing the whole body cannot reproduce one.
    const rejected = malformedFailure();
    if (isOk(rejected)) throw new Error("expected failure");

    const serialized = JSON.stringify(errorResponseForAdapterError(rejected.error).body);

    expect(serialized).not.toContain(VENDOR_SECRET);
    // Field names do travel: that is the per-field detail a technician reads.
    expect(serialized).toContain("api_token");
  });

  it("keeps the vendor out of the body while the adapter still carries it", () => {
    const rejected = malformedFailure();
    if (isOk(rejected)) throw new Error("expected failure");

    expect(rejected.error.vendor).toBe("B");
    expect(JSON.stringify(errorResponseForAdapterError(rejected.error).body)).not.toContain(
      '"vendor"',
    );
  });

  it("puts a synthesized issue on the wire for a rejection with no schema error behind it", () => {
    const rejected = failure({
      kind: "unmappable_value",
      vendor: "A",
      issues: issuesForKind("unmappable_value", "status", "no honest canonical mapping"),
    });

    const { status, body } = errorResponseForAdapterError(rejected.error);

    expect(status).toBe(400);
    expect(body.error.kind).toBe("unmappable_value");
    expect(body.error.issues[0]).toEqual({
      path: "status",
      code: "unmappable_value",
      message: "no honest canonical mapping",
    });
  });

  it("answers every adapter kind, because the wire vocabulary contains all of them", () => {
    for (const kind of ADAPTER_ERROR_KINDS) {
      expect(errorResponseForAdapterError({ kind, vendor: "C", issues: [] }).body.error.kind).toBe(
        kind,
      );
    }
  });
});
