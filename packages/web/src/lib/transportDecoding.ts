/**
 * The console's boundary: bytes from the network become contract types here, or they are
 * refused here.
 *
 * **A failed request and a failed decode are different outcomes and are not merged.** A
 * connection refused is recoverable; a body that does not satisfy the canonical schema is
 * terminal, because the server did not stumble — it sent bytes this console cannot read,
 * and retrying returns the same bytes (ADR 20, web spec § 9). Collapsing them produces a
 * console that retries forever against a contract mismatch, showing a spinner where it
 * should show an error naming the field.
 *
 * Every issue carries `path` and `code` but never a rejected value (ADR 20), so a
 * diagnostics surface can name what disagreed without a payload reaching a screen.
 */

import {
  parseFleetSnapshot,
  parseHealthResponse,
  parseRegisteredRobotState,
  parseRobotBatteryHistory,
  parseRobotDiagnosticEnvelope,
  parseTelemetryBatch,
} from "@fleet/contracts";
import type {
  ContractIssue,
  FleetSnapshot,
  HealthResponse,
  ParseResult,
  RegisteredRobotState,
  RobotBatteryHistory,
  RobotDiagnosticEnvelope,
  TelemetryBatch,
} from "@fleet/contracts";

const NOT_FOUND_STATUS = 404;

export type RequestFailure =
  | { readonly kind: "unreachable"; readonly status: number | null }
  | { readonly kind: "contract"; readonly issues: readonly ContractIssue[] };

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchResponse>;

type JsonRequest =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly status: number | null };

type DecodeOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: RequestFailure };

/**
 * Performs the request half of every fetch here, leaving each caller its own policy over
 * the status and its own decode of the body.
 *
 * @returns A null status for a rejected request — offline, DNS, a refused connection, or
 *   a body that was not JSON at all. Those are network facts rather than contract facts,
 *   and all of them are worth retrying.
 */
async function requestJson(fetchLike: FetchLike, url: string): Promise<JsonRequest> {
  try {
    const response = await fetchLike(url);
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, status: null };
  }
}

/**
 * Fetches one JSON body and decodes it, preserving the request-versus-contract
 * distinction. Endpoints whose failure handling is more than this — a 404 that is a
 * navigation outcome, or a body with two possible schemas — do their own sequencing.
 */
async function fetchDecoded<T>(
  fetchLike: FetchLike,
  url: string,
  parse: (raw: unknown) => ParseResult<T>,
): Promise<DecodeOutcome<T>> {
  const request = await requestJson(fetchLike, url);
  if (!request.ok) {
    return { ok: false, failure: { kind: "unreachable", status: request.status } };
  }

  const decoded = parse(request.body);
  return decoded.ok
    ? { ok: true, value: decoded.value }
    : { ok: false, failure: { kind: "contract", issues: decoded.issues } };
}

export type SnapshotOutcome =
  | { readonly ok: true; readonly snapshot: FleetSnapshot }
  | { readonly ok: false; readonly failure: RequestFailure };

/**
 * Fetches and decodes the initial fleet snapshot.
 *
 * Nothing here may build a host or read an environment variable (ADR 21): a console that
 * learns the server's real address is one whose requests are cross-origin.
 *
 * @param url - Same-origin, built from `TENANT.endpoints.apiBaseUrl`.
 * @returns Never rejects: every failure is a value. `unreachable` — which any non-2xx
 *   status is, a 500 included — must be retried under ADR 31's schedule; `contract` must
 *   not be, and the caller is expected to end the session on it rather than counting it
 *   as one more failed attempt.
 */
export async function fetchFleetSnapshot(
  fetchLike: FetchLike,
  url: string,
): Promise<SnapshotOutcome> {
  const outcome = await fetchDecoded(fetchLike, url, parseFleetSnapshot);
  return outcome.ok ? { ok: true, snapshot: outcome.value } : outcome;
}

export type FrameOutcome =
  | { readonly ok: true; readonly batch: TelemetryBatch }
  | { readonly ok: false; readonly issues: readonly ContractIssue[] };

export function decodeFrame(raw: unknown): FrameOutcome {
  const decoded = parseTelemetryBatch(raw);
  return decoded.ok ? { ok: true, batch: decoded.value } : { ok: false, issues: decoded.issues };
}

export function decodeFrameText(text: string): FrameOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      issues: [
        {
          path: "(root)",
          code: "invalid_json",
          message: "Frame body is not JSON.",
        },
      ],
    };
  }
  return decodeFrame(raw);
}

export type RobotDetailResponse =
  | { readonly observed: true; readonly envelope: RobotDiagnosticEnvelope }
  | { readonly observed: false; readonly registered: RegisteredRobotState };

export type RobotDetailFailure = { readonly kind: "not-found" } | RequestFailure;

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
 * populations inside a fleet snapshot. Trying both here is the explicit boundary policy: if
 * another consumer needs the same union, move that authority into contracts instead of
 * copying it.
 *
 * A 404 is its own outcome, not an error: an unknown robot id is a wrong link, and the
 * page renders an empty state with a way back rather than a failure banner (robot detail
 * spec § 10).
 *
 * @param url - `/api/robots/:id`, with the id already percent-encoded by the caller.
 * @returns Never rejects. `not-found` is a navigation outcome and must not render as a
 *   fault; success still discriminates observed from registered, because the endpoint
 *   serves two shapes and a registered robot has no telemetry.
 */
export async function fetchRobotDetail(
  fetchLike: FetchLike,
  url: string,
): Promise<RobotDetailOutcome> {
  const request = await requestJson(fetchLike, url);
  if (!request.ok) {
    return { ok: false, failure: toRobotDetailRequestFailure(request.status) };
  }
  return decodeRobotDetail(request.body);
}

/** A missing robot is a navigation outcome; every other status is worth a retry. */
function toRobotDetailRequestFailure(status: number | null): RobotDetailFailure {
  return status === NOT_FOUND_STATUS ? { kind: "not-found" } : { kind: "unreachable", status };
}

/** Tries the larger shape first, so a registered robot cannot satisfy it by accident. */
function decodeRobotDetail(body: unknown): RobotDetailOutcome {
  const diagnostic = parseRobotDiagnosticEnvelope(body);
  if (diagnostic.ok) {
    return { ok: true, robot: { observed: true, envelope: diagnostic.value } };
  }

  const registration = parseRegisteredRobotState(body);
  if (registration.ok) {
    return { ok: true, robot: { observed: false, registered: registration.value } };
  }

  // The diagnostic issues, not the registration's: a body that failed both is far more
  // likely a malformed envelope than a malformed two-field registration, and reporting the
  // narrower schema's complaints would point a reader at the wrong shape.
  return { ok: false, failure: { kind: "contract", issues: diagnostic.issues } };
}

export type HealthOutcome =
  { readonly ok: true; readonly health: HealthResponse } | { readonly ok: false };

export async function fetchHealth(fetchLike: FetchLike, url: string): Promise<HealthOutcome> {
  const outcome = await fetchDecoded(fetchLike, url, parseHealthResponse);
  return outcome.ok ? { ok: true, health: outcome.value } : { ok: false };
}

export type BatteryHistoryOutcome =
  | { readonly ok: true; readonly history: RobotBatteryHistory }
  | { readonly ok: false; readonly failure: RequestFailure };

export async function fetchBatteryHistory(
  fetchLike: FetchLike,
  url: string,
): Promise<BatteryHistoryOutcome> {
  const outcome = await fetchDecoded(fetchLike, url, parseRobotBatteryHistory);
  return outcome.ok ? { ok: true, history: outcome.value } : outcome;
}
