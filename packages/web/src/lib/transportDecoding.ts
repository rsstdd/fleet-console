import {
  type ContractIssue,
  type FleetSnapshot,
  type ParseResult,
  parseFleetSnapshot,
  parseRegisteredRobotState,
  parseRobotDiagnosticEnvelope,
  parseTelemetryBatch,
  type TelemetryBatch,
} from "@fleet/contracts";
import { toRegisteredRobotDetail, toRobotDetail } from "@/utils/fromEnvelope";
import type { RobotDetail } from "@/types/robot";

export type RequestFailure =
  | { readonly kind: "unreachable"; readonly status: number | null }
  | { readonly kind: "contract"; readonly issues: readonly ContractIssue[] };

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<FetchResponse>;

export type Decoded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: RequestFailure };

/** Every response is decoded at the boundary; nothing is cast into a trusted type. */
async function fetchDecoded<T>(
  fetchLike: FetchLike,
  url: string,
  parse: (raw: unknown) => ParseResult<T>,
): Promise<Decoded<T>> {
  let body: unknown;
  try {
    const response = await fetchLike(url);
    if (!response.ok) {
      return { ok: false, failure: { kind: "unreachable", status: response.status } };
    }
    body = await response.json();
  } catch {
    return { ok: false, failure: { kind: "unreachable", status: null } };
  }
  const decoded = parse(body);
  return decoded.ok
    ? { ok: true, value: decoded.value }
    : { ok: false, failure: { kind: "contract", issues: decoded.issues } };
}

export function fetchFleetSnapshot(
  fetchLike: FetchLike,
  url: string,
): Promise<Decoded<FleetSnapshot>> {
  return fetchDecoded(fetchLike, url, parseFleetSnapshot);
}

export type FrameOutcome =
  { readonly ok: true; readonly batch: TelemetryBatch } | { readonly ok: false };

export function decodeFrameText(text: string): FrameOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false };
  }
  const decoded = parseTelemetryBatch(raw);
  return decoded.ok ? { ok: true, batch: decoded.value } : { ok: false };
}

export type RobotDetailFailure = { readonly kind: "not-found" } | RequestFailure;

/** A robot may come back observed or merely registered; both are valid answers. */
export async function fetchRobotDetail(
  fetchLike: FetchLike,
  url: string,
): Promise<{ ok: true; value: RobotDetail } | { ok: false; failure: RobotDetailFailure }> {
  let body: unknown;
  try {
    const response = await fetchLike(url);
    if (!response.ok) {
      return {
        ok: false,
        failure:
          response.status === 404
            ? { kind: "not-found" }
            : { kind: "unreachable", status: response.status },
      };
    }
    body = await response.json();
  } catch {
    return { ok: false, failure: { kind: "unreachable", status: null } };
  }

  const diagnostic = parseRobotDiagnosticEnvelope(body);
  if (diagnostic.ok) {
    return { ok: true, value: toRobotDetail(diagnostic.value) };
  }
  const registered = parseRegisteredRobotState(body);
  if (registered.ok) {
    return { ok: true, value: toRegisteredRobotDetail(registered.value) };
  }
  return { ok: false, failure: { kind: "contract", issues: diagnostic.issues } };
}
