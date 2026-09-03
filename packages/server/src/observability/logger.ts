/**
 * Structured events: one JSON object per line, on stdout.
 *
 * `no-console` is an error in this package (Principle 12), so the logger is a real module
 * with a decided shape rather than strings that happen to be on a stream. One object per
 * line keeps the same output readable by a person during a demo and parseable by the
 * measurement harness ADR 2 commits to (**I2**).
 *
 * The sink is injected, so nothing that logs needs a process global to be testable, and
 * the module itself holds the only write.
 *
 * Coupling: `packages/simulator/src/observability/logger.ts` is the same shape, decided
 * first and deliberately **not** shared — see the deferred note in `TODO.md` § Section 9.
 * The two must agree on the record shape or one stream cannot be read with the other.
 */

/** Severity of a structured record. */
export type LogLevel = "info" | "warn" | "error";

/** A sink for structured records; a caller takes this rather than writing to a stream. */
export interface Logger {
  readonly log: (
    level: LogLevel,
    event: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => void;
}

/** The default sink; isolated so the logger itself stays free of process globals. */
function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Builds a logger that serializes each record to one line.
 *
 * `event` is a stable name and `fields` is everything that varies, rather than an
 * interpolated sentence: a name that changes with its data cannot be counted, and counting
 * is what **I1** exists for.
 */
export function createJsonLogger(write: (line: string) => void = writeStdout): Logger {
  return {
    log(level, event, fields = {}): void {
      write(JSON.stringify({ level, event, ...fields }));
    },
  };
}
