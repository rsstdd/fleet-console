import {
  parseFleetSnapshot,
  parseHealthResponse,
  parseRegisteredRobotState,
  parseRobotDiagnosticEnvelope,
  parseTelemetryBatch,
} from "@fleet/contracts";
import type {
  ContractIssue,
  FleetSnapshot,
  HealthResponse,
  RegisteredRobotState,
  RobotDiagnosticEnvelope,
  TelemetryBatch,
} from "@fleet/contracts";

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

/** One robot as the detail endpoint serves it: observed with diagnostics, or registered. */
export type RobotDetailResponse =
  | { readonly observed: true; readonly envelope: RobotDiagnosticEnvelope }
  | { readonly observed: false; readonly registered: RegisteredRobotState };

/** Why a single-robot request produced no robot. */
export type RobotDetailFailure =
  | { readonly kind: "not-found" }
  | { readonly kind: "unreachable"; readonly status: number | null }
  | { readonly kind: "contract"; readonly issues: readonly ContractIssue[] };

/** What one single-robot request produced. */
export type RobotDetailOutcome =
  | { readonly ok: true; readonly robot: RobotDetailResponse }
  | { readonly ok: false; readonly failure: RobotDetailFailure };

/**
 * Fetches and decodes one robot.
 *
 * **Two parsers, because the contract has no union for this response.** The endpoint
 * serves `robotDiagnosticEnvelopeSchema` for a robot that has reported and
 * `registeredRobotStateSchema` for one the manifest registered and nothing has been heard
 * from, and `@fleet/contracts` exports no combined schema the way it does for the same two
 * populations inside a fleet snapshot. Trying both here is the consequence, and it is
 * recorded as a contracts change in `packages/server/TODO.md` **G2** rather than worked
 * around permanently — the diagnostic shape is tried first because it is the strictly
 * larger one, so a registered robot cannot satisfy it by accident.
 *
 * A 404 is its own outcome, not an error: an unknown robot id is a wrong link, and the
 * page renders an empty state with a way back rather than a failure banner (robot detail
 * spec § 10).
 */
export async function fetchRobotDetail(
  fetchLike: FetchLike,
  url: string,
): Promise<RobotDetailOutcome> {
  let body: unknown;
  try {
    const response = await fetchLike(url);
    if (response.status === 404) return { ok: false, failure: { kind: "not-found" } };
    if (!response.ok) {
      return { ok: false, failure: { kind: "unreachable", status: response.status } };
    }
    body = await response.json();
  } catch {
    return { ok: false, failure: { kind: "unreachable", status: null } };
  }

  const observed = parseRobotDiagnosticEnvelope(body);
  if (observed.ok) return { ok: true, robot: { observed: true, envelope: observed.value } };

  const registered = parseRegisteredRobotState(body);
  if (registered.ok) return { ok: true, robot: { observed: false, registered: registered.value } };

  // The diagnostic issues, not the registered ones: a body that failed both is far more
  // likely a malformed envelope than a malformed two-field registration, and reporting the
  // narrower schema's complaints would point a reader at the wrong shape.
  return { ok: false, failure: { kind: "contract", issues: observed.issues } };
}

/** What one health request produced; a failure is never terminal, since health is advisory. */
export type HealthOutcome =
  { readonly ok: true; readonly health: HealthResponse } | { readonly ok: false };

/**
 * Fetches the operational counters.
 *
 * Its failure is deliberately shapeless. Health decorates a technician panel with a
 * fleet-wide unknown-field count; a console that could not read it still knows everything
 * about the robot it is showing, so degrading to "not reported" is right and blocking the
 * page on it would be a diagnostics surface taking the operator's view down with it.
 */
export async function fetchHealth(fetchLike: FetchLike, url: string): Promise<HealthOutcome> {
  try {
    const response = await fetchLike(url);
    if (!response.ok) return { ok: false };
    const decoded = parseHealthResponse(await response.json());
    return decoded.ok ? { ok: true, health: decoded.value } : { ok: false };
  } catch {
    return { ok: false };
  }
}
