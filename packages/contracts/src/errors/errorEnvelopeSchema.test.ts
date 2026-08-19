import { describe, expect, it } from "vitest";

import type { z } from "zod";

import type { contractIssueSchema } from "./errorEnvelopeSchema.js";
import {
  ADAPTER_ERROR_KINDS,
  ERROR_KINDS,
  type AdapterErrorKind,
  type ErrorEnvelope,
  type ErrorKind,
  errorEnvelopeSchema,
  parseErrorEnvelope,
} from "./errorEnvelopeSchema.js";
import {
  type ContractIssue,
  SCHEMA_VERSION,
  parseWith,
  positionSchema,
  toContractIssues,
} from "../shared/primitives.js";
import { adapterEnvelopeSchema } from "../envelope/envelopeSchema.js";

type Assert<T extends true> = T;

export type ErrorEnvelopeTypeAssertions = [
  // ADR 20: the wire schema and the in-process interface are one vocabulary,
  // not two shapes that happen to agree today. Both directions together mean
  // the same field set with the same types; `readonly` is deliberately not
  // compared, because decoding produces a fresh object either way.
  Assert<z.infer<typeof contractIssueSchema> extends ContractIssue ? true : false>,
  Assert<ContractIssue extends z.infer<typeof contractIssueSchema> ? true : false>,
  // The adapter's kinds are a subset of the wire's, which is what lets the
  // server copy `kind` across the hop instead of mapping it.
  Assert<AdapterErrorKind extends ErrorKind ? true : false>,
];

/** A minimal well-formed error body. */
function body(overrides: Partial<ErrorEnvelope["error"]> = {}): ErrorEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    error: {
      kind: "malformed_payload",
      message: "The payload did not satisfy vendor A's schema.",
      issues: [{ path: "battery", code: "invalid_type", message: "Invalid input" }],
      ...overrides,
    },
  };
}

describe("error kind vocabulary", () => {
  it("keeps every adapter kind on the wire, so the hop is a copy and not a mapping", () => {
    for (const kind of ADAPTER_ERROR_KINDS) {
      expect(ERROR_KINDS).toContain(kind);
    }
  });

  it("names the server-only kinds the adapter cannot produce", () => {
    // An unsupported vendor is a 404 with its own counter (ADR 8), which means
    // it is a distinct kind rather than a malformed payload with nicer prose.
    expect(ERROR_KINDS).toContain("unsupported_vendor");
    expect(ERROR_KINDS).toContain("not_found");
    expect(ERROR_KINDS).toContain("internal");
  });

  it("rejects a kind outside the closed vocabulary", () => {
    expect(
      errorEnvelopeSchema.safeParse({ ...body(), error: { ...body().error, kind: "teapot" } })
        .success,
    ).toBe(false);
  });
});

describe("errorEnvelopeSchema", () => {
  it("decodes a well-formed error body", () => {
    const result = parseErrorEnvelope(JSON.parse(JSON.stringify(body())));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.error.kind).toBe("malformed_payload");
    expect(result.value.error.issues[0]?.path).toBe("battery");
  });

  it("accepts an empty issue list for a failure that is not field-scoped", () => {
    expect(parseErrorEnvelope(body({ kind: "not_found", issues: [] })).ok).toBe(true);
  });

  it("rejects an unrecognized field, like every other canonical shape", () => {
    expect(parseErrorEnvelope({ ...body(), retryAfter: 5 }).ok).toBe(false);
  });

  it("rejects an issue that is missing its path, so a detail-free issue cannot ship", () => {
    const withoutPath = {
      ...body(),
      error: { ...body().error, issues: [{ code: "invalid_type", message: "x" }] },
    };

    expect(parseErrorEnvelope(withoutPath).ok).toBe(false);
  });

  it("survives a JSON round trip unchanged", () => {
    const decoded = parseErrorEnvelope(JSON.parse(JSON.stringify(body())));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value).toEqual(body());
  });
});

describe("issues crossing the wire", () => {
  it("carries a decoder's own issues without reshaping them", () => {
    // The property the whole decision turns on: what the parser produced is
    // what the console receives (ADR 20).
    const rejected = parseWith(positionSchema, { frame: "site-map", x: "north", y: 2 });
    if (rejected.ok) throw new Error("expected a failure");

    const decoded = parseErrorEnvelope(
      JSON.parse(JSON.stringify(body({ issues: [...rejected.issues] }))),
    );

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.error.issues).toEqual(rejected.issues);
  });

  it("carries no rejected value, only the path and the category", () => {
    // packages/server G6: nothing a vendor sent may appear in an error body.
    // The guarantee comes from ContractIssue holding no value, so it is tested
    // against a payload whose *values* are distinctive.
    const secret = "sk-live-8f2c-do-not-leak";
    const rejected = parseWith(adapterEnvelopeSchema, {
      schemaVersion: SCHEMA_VERSION,
      robotId: `${secret}!!`,
      siteId: 42,
      credential: secret,
    });
    if (rejected.ok) throw new Error("expected a failure");

    const serialized = JSON.stringify(body({ issues: [...rejected.issues] }));

    expect(serialized).not.toContain(secret);
    // The field *name* does travel — that is the per-field detail the console
    // renders — so the path names the offending key and nothing else.
    expect(rejected.issues.map((issue) => issue.path)).toContain("credential");
  });
});

describe("toContractIssues on unrecognized keys", () => {
  it("reports one issue per rejected key, with the key in the path", () => {
    // Before ADR 20 the key list was flattened into the message and lost, which
    // ADR 10 § Observed consequences recorded as a gap in the issue shape.
    const parsed = adapterEnvelopeSchema.safeParse({ freshness: "live", also: 1 });
    if (parsed.success) throw new Error("expected a failure");

    const unrecognized = toContractIssues(parsed.error)
      .filter((issue) => issue.code === "unrecognized_keys")
      .map((issue) => issue.path);

    expect(unrecognized).toEqual(["freshness", "also"]);
  });

  it("dots a nested key onto its parent path", () => {
    const parsed = adapterEnvelopeSchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      core: { unexpected: 1 },
    });
    if (parsed.success) throw new Error("expected a failure");

    expect(
      toContractIssues(parsed.error).filter((issue) => issue.code === "unrecognized_keys"),
    ).toContainEqual(expect.objectContaining({ path: "core.unexpected" }));
  });
});
