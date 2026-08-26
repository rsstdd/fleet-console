import type { AdapterEnvelope, AdapterErrorKind, ContractIssue } from "@fleet/contracts";

export type SupportedVendor = "A" | "B" | "C";
export const SUPPORTED_VENDORS: readonly SupportedVendor[] = ["A", "B", "C"];

export function isSupportedVendor(value: unknown): value is SupportedVendor {
  return typeof value === "string" && SUPPORTED_VENDORS.some((vendor) => vendor === value);
}

export interface AdapterError {
  readonly kind: AdapterErrorKind;
  readonly vendor: SupportedVendor;
  readonly issues: readonly ContractIssue[];
}

export type AdapterResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: AdapterError };

export type VendorAdapter = (
  payload: unknown,
  receivedAt: number,
) => AdapterResult<AdapterEnvelope>;

export function ok<TValue>(value: TValue): AdapterResult<TValue> {
  return { ok: true, value };
}

export function failure(error: AdapterError): AdapterResult<never> {
  return { ok: false, error };
}

export function unmappable(
  vendor: SupportedVendor,
  path: string,
  message: string,
): AdapterResult<never> {
  return failure({
    kind: "unmappable_value",
    vendor,
    issues: [{ path, code: "unmappable_value", message }],
  });
}
