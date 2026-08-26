import {
  SCHEMA_VERSION,
  type ContractIssue,
  type ErrorEnvelope,
  type ErrorKind,
} from "@fleet/contracts";

export type ErrorStatus = 400 | 404 | 413 | 500;

const STATUS_BY_KIND: Readonly<Record<ErrorKind, ErrorStatus>> = {
  malformed_payload: 400,
  unmappable_value: 400,
  unsupported_dialect: 400,
  unsupported_vendor: 404,
  not_found: 404,
  payload_too_large: 413,
  internal: 500,
};

const SUMMARY_BY_KIND: Readonly<Record<ErrorKind, string>> = {
  malformed_payload: "The payload did not satisfy the vendor schema.",
  unmappable_value: "The payload carried a value with no canonical mapping.",
  unsupported_dialect: "The payload named a dialect version this adapter does not support.",
  unsupported_vendor: "No adapter is registered for that vendor.",
  not_found: "No such resource.",
  payload_too_large: "The request body exceeded the ingest size limit.",
  internal: "The server failed to handle the request.",
};

export interface ErrorResponse {
  readonly status: ErrorStatus;
  readonly body: ErrorEnvelope;
}

export function errorResponse(
  kind: ErrorKind,
  issues: readonly ContractIssue[] = [],
): ErrorResponse {
  return {
    status: STATUS_BY_KIND[kind],
    body: {
      schemaVersion: SCHEMA_VERSION,
      error: { kind, message: SUMMARY_BY_KIND[kind], issues: [...issues] },
    },
  };
}
