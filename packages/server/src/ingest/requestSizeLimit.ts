/**
 * The ingest request size cap: the one thing about a raw vendor payload that can
 * actually be bounded.
 *
 * ADR 26 keeps the latest payload per robot verbatim — no redaction — because field-name
 * redaction over an unknown vendor dialect offers assurance it cannot deliver: the fields
 * you would need to name are exactly the ones you do not know about, and stripping them
 * removes the evidence the diagnostic endpoint exists to provide. What *is* boundable is
 * the number of bytes the server will accept, and bounding that bounds retained memory
 * too, because retention is one payload per robot.
 *
 * **Both guards must run before `JSON.parse` and before any adapter work.** A cap applied
 * after decoding does not protect the decode it was meant to protect; it only protects the
 * store, which was never the expensive part (ADR 26 § Sequencing).
 */

/**
 * Largest accepted request body, in bytes.
 *
 * Derived rather than picked. The three recorded vendor fixtures are 221, 404 and 428
 * bytes, so 64 KiB is roughly 150x the largest dialect anyone here actually sends —
 * generous enough that no honest vendor meets it, small enough that the worst case stays
 * arithmetic rather than a hope: 500 robots x 64 KiB is 32,768,000 bytes — **31.25 MiB**
 * of retained payload, a number ADR 6's in-memory budget can be checked against.
 *
 * Raising this raises retained memory linearly and silently. Whoever raises it owes the
 * same arithmetic at the new number.
 */
export const MAX_INGEST_BYTES = 64 * 1024;

/** Why a request was refused on size, and what it would take to comply. */
export interface SizeRejection {
  /**
   * `declared` — refused on the caller's own `Content-Length`, before a byte was read.
   * `measured` — refused while reading, because the body outran what was declared or
   * nothing was declared at all.
   */
  readonly basis: "declared" | "measured";
  readonly limit: number;
  /** Bytes observed at the moment of refusal; for `measured`, not the full body size. */
  readonly observed: number;
}

/**
 * Checks a `Content-Length` header before reading the body.
 *
 * A cheap early exit only. **This is not the enforcement** — `Content-Length` is
 * caller-supplied and therefore untrusted, so a client that under-declares or omits it
 * walks straight past this check. Treating a header as a limit is the mistake this
 * comment exists to prevent; `createByteBudget` is what actually holds.
 *
 * An absent, malformed or negative header returns `null` — nothing to reject on yet —
 * rather than a rejection, because a body that never arrives costs nothing and a body
 * that does is caught by the budget.
 */
export function checkDeclaredSize(
  contentLength: string | null | undefined,
  limit: number = MAX_INGEST_BYTES,
): SizeRejection | null {
  if (contentLength === null || contentLength === undefined) {
    return null;
  }
  if (!/^\d+$/.test(contentLength.trim())) {
    return null;
  }
  const declared = Number.parseInt(contentLength.trim(), 10);
  return declared > limit ? { basis: "declared", limit, observed: declared } : null;
}

/** A running byte count that refuses the moment the body outgrows the cap. */
export interface ByteBudget {
  /**
   * Adds one chunk's byte length. Returns the rejection the first time the running
   * total exceeds the limit, and `null` while there is still room.
   *
   * Call this per chunk as the body streams, not once at the end. Accumulating the whole
   * body and then measuring it means an unbounded body was already in memory, which is
   * the cost the cap exists to avoid.
   */
  add(byteLength: number): SizeRejection | null;
  /** Bytes counted so far. */
  total(): number;
}

/**
 * Creates a budget for one request.
 *
 * Per request rather than shared: a shared counter would make one large payload reject
 * an unrelated caller's next one, which is a denial of service with extra steps.
 */
export function createByteBudget(limit: number = MAX_INGEST_BYTES): ByteBudget {
  let total = 0;
  return {
    add(byteLength: number): SizeRejection | null {
      total += byteLength;
      return total > limit ? { basis: "measured", limit, observed: total } : null;
    },
    total(): number {
      return total;
    },
  };
}
