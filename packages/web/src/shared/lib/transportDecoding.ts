import { parseFleetSnapshot, parseTelemetryBatch } from "@fleet/contracts";
import type { ContractIssue, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

/**
 * The console's boundary: bytes from the network become contract types here, or they are
 * refused here.
 *
 * Principle 2 puts one decode at the boundary and forbids casting a payload into a trusted
 * type anywhere else. Everything downstream — the store, the mappers, the components —
 * takes a decoded value, so no component ever reaches into a response.
 *
 * **A failed decode and a failed request are different outcomes and are not merged.** A
 * connection refused is recoverable and retrying is the right response; a body that does
 * not satisfy the canonical schema is terminal, because the server did not stumble, it
 * sent bytes this console cannot read, and retrying returns the same bytes
 * (`entities/robot/TODO.md` **W-6**). Collapsing them produces a console that retries
 * forever against a contract mismatch, showing a spinner where it should show an error
 * naming the field.
 *
 * The issues travel with the terminal outcome rather than being flattened to a string.
 * They carry `path` and `code` from the contract's own failure shape and never a rejected
 * value (ADR 20), so a diagnostics surface can say which field disagreed without a
 * vendor payload reaching an operator's screen.
 */

/** Why a snapshot request produced no usable fleet. */
export type SnapshotFailure =
  /** The request never completed, or the server answered with a status. Retry is correct. */
  | { readonly kind: "unreachable"; readonly status: number | null }
  /** The body decoded to something this console's contract does not accept. Terminal. */
  | { readonly kind: "contract"; readonly issues: readonly ContractIssue[] };

/** What one snapshot request produced. */
export type SnapshotOutcome =
  | { readonly ok: true; readonly snapshot: FleetSnapshot }
  | { readonly ok: false; readonly failure: SnapshotFailure };

/** The subset of `fetch` this module uses, so a test needs no network and no globals. */
export type FetchLike = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

/**
 * Fetches and decodes the initial fleet snapshot.
 *
 * The URL comes from `TENANT.endpoints.apiBaseUrl`, which ships as the same-origin path
 * `/api` that Vite's dev proxy forwards (ADR 21). Nothing here may build a host or read
 * an environment variable: the console learning the server's real address is what would
 * make its requests cross-origin.
 *
 * A non-2xx status is `unreachable` rather than `contract`, including a 500. The server
 * failing to produce a body is not the same event as producing one this console cannot
 * read, and only the second is worth refusing to retry.
 */
export async function fetchFleetSnapshot(
  fetchLike: FetchLike,
  url: string,
): Promise<SnapshotOutcome> {
  let body: unknown;
  try {
    const response = await fetchLike(url);
    if (!response.ok) {
      return { ok: false, failure: { kind: "unreachable", status: response.status } };
    }
    body = await response.json();
  } catch {
    // A rejected fetch is a network fact, not a contract fact: offline, DNS, a refused
    // connection, or a body that was not JSON at all. All are worth retrying.
    return { ok: false, failure: { kind: "unreachable", status: null } };
  }

  const decoded = parseFleetSnapshot(body);
  return decoded.ok
    ? { ok: true, snapshot: decoded.value }
    : { ok: false, failure: { kind: "contract", issues: decoded.issues } };
}

/** What one stream frame produced. */
export type FrameOutcome =
  | { readonly ok: true; readonly batch: TelemetryBatch }
  | { readonly ok: false; readonly issues: readonly ContractIssue[] };

/**
 * Decodes one frame from the stream.
 *
 * A frame that fails is **dropped and counted**, not terminal, because a stream is many
 * messages and the next one may be fine — where a snapshot is one response whose failure
 * retrying cannot fix. The cost of dropping one is a missed update for the robots it
 * named, which the server's next flush or freshness sweep corrects.
 *
 * That is deliberately not free: a run of failures means the contract is broken and the
 * console is degrading silently, which is why the caller counts them for a diagnostics
 * surface (fleet TODO **A4**). Whether a run should escalate to terminal is **not
 * decided** — see the note in that item.
 */
export function decodeFrame(raw: unknown): FrameOutcome {
  const decoded = parseTelemetryBatch(raw);
  return decoded.ok ? { ok: true, batch: decoded.value } : { ok: false, issues: decoded.issues };
}

/** Parses a socket message's data before decoding it, without trusting either step. */
export function decodeFrameText(text: string): FrameOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Not JSON at all. Reported in the same shape as a schema failure so a caller has one
    // path to count and one path to render, with the empty issue list saying which it was.
    return { ok: false, issues: [] };
  }
  return decodeFrame(raw);
}
