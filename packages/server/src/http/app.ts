import { Hono } from "hono";
import type { HealthResponse } from "@fleet/contracts";
import { isSupportedVendor, type SupportedVendor } from "../adapters/result.ts";
import { errorResponse } from "./errors.ts";
import type { FleetSnapshotWire, RobotDetailWire } from "./encode.ts";

/** Enforced against both declared and received body size. */
const MAX_INGEST_BYTES = 64 * 1024;

export interface IngestOutcome {
  readonly ok: boolean;
  readonly response?: { readonly status: number; readonly body: unknown };
}

export interface HttpAppOptions {
  readonly allowedOrigins: readonly string[];
  readonly readFleet: () => FleetSnapshotWire;
  readonly readRobot: (robotId: string) => RobotDetailWire | null;
  readonly readHealth: () => HealthResponse;
  readonly ingest: {
    readonly apply: (vendor: SupportedVendor, raw: unknown) => IngestOutcome;
    readonly noteUnsupportedVendor: () => void;
    readonly noteMalformedBody: () => void;
  };
}

function corsHeaders(
  origin: string | undefined,
  allowed: readonly string[],
): Record<string, string> {
  if (origin === undefined || !allowed.includes(origin)) {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export function createHttpApp(options: HttpAppOptions): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const headers = corsHeaders(c.req.header("origin"), options.allowedOrigins);
    if (c.req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    await next();
    for (const [name, value] of Object.entries(headers)) {
      c.res.headers.set(name, value);
    }
    return undefined;
  });

  app.post("/api/telemetry/:vendor", async (c) => {
    const vendor = c.req.param("vendor");
    if (!isSupportedVendor(vendor)) {
      options.ingest.noteUnsupportedVendor();
      const { status, body } = errorResponse("unsupported_vendor");
      return c.json(body, status);
    }

    const declared = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_INGEST_BYTES) {
      const { status, body } = errorResponse("payload_too_large");
      return c.json(body, status);
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > MAX_INGEST_BYTES) {
      const { status, body } = errorResponse("payload_too_large");
      return c.json(body, status);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      options.ingest.noteMalformedBody();
      const { status, body } = errorResponse("malformed_payload");
      return c.json(body, status);
    }

    const outcome = options.ingest.apply(vendor, raw);
    if (!outcome.ok && outcome.response !== undefined) {
      return c.json(outcome.response.body, outcome.response.status as 400);
    }
    return c.body(null, 204);
  });

  app.get("/api/fleet", (c) => c.json(options.readFleet()));

  app.get("/api/robots/:id", (c) => {
    const robot = options.readRobot(c.req.param("id"));
    if (robot === null) {
      const { status, body } = errorResponse("not_found");
      return c.json(body, status);
    }
    return c.json(robot);
  });

  app.get("/api/health", (c) => c.json(options.readHealth()));

  app.notFound((c) => {
    const { status, body } = errorResponse("not_found");
    return c.json(body, status);
  });

  app.onError((_error, c) => {
    const { status, body } = errorResponse("internal");
    return c.json(body, status);
  });

  return app;
}
