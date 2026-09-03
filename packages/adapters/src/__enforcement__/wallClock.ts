/**
 * Violates the wall-clock ban (ADR 3): adapters take `receivedAt` from the server
 * boundary and normalize `reportedAt` from the payload. Neither is read here.
 */
export function stampedNow(): number {
  const viaConstructor = new Date().getTime();
  return Date.now() + viaConstructor;
}
