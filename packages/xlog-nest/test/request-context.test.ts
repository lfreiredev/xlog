import { describe, expect, it } from "vitest";
import { createLogger, LogEvent, Sink } from "xlog";
import { ALSContext } from "../src/context";
import { RequestContextMiddleware } from "../src/middleware";

class MemorySink implements Sink {
  events: LogEvent[] = [];
  write(event: LogEvent): void {
    this.events.push(event);
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

describe("RequestContextMiddleware", () => {
  it("uses x-request-id from headers", () => {
    const als = new ALSContext();
    const sink = new MemorySink();
    const logger = createLogger({
      service: "svc",
      env: "test",
      sinks: [sink],
      contextProvider: () => als.getContext()
    });

    const middleware = new RequestContextMiddleware(als, logger);

    const headers: Record<string, string> = { "x-request-id": "req-123" };
    const req = { headers, method: "GET", url: "/test" } as any;

    const resHeaders: Record<string, unknown> = {};
    const res = {
      setHeader: (key: string, value: unknown) => {
        resHeaders[key.toLowerCase()] = value;
      },
      on: (_event: string, _cb: () => void) => {
        // no-op
      }
    } as any;

    let ctxRequestId: string | undefined;
    middleware.use(req, res, () => {
      ctxRequestId = als.getContext()?.requestId;
    });

    expect(resHeaders["x-request-id"]).toBe("req-123");
    expect(ctxRequestId).toBe("req-123");
  });

  it("generates requestId when header is missing", () => {
    const als = new ALSContext();
    const sink = new MemorySink();
    const logger = createLogger({
      service: "svc",
      env: "test",
      sinks: [sink],
      contextProvider: () => als.getContext()
    });

    const middleware = new RequestContextMiddleware(als, logger);

    const req = { headers: {}, method: "GET", url: "/test" } as any;

    const resHeaders: Record<string, unknown> = {};
    const res = {
      setHeader: (key: string, value: unknown) => {
        resHeaders[key.toLowerCase()] = value;
      },
      on: (_event: string, _cb: () => void) => {
        // no-op
      }
    } as any;

    let ctxRequestId: string | undefined;
    middleware.use(req, res, () => {
      ctxRequestId = als.getContext()?.requestId;
    });

    const headerValue = resHeaders["x-request-id"];
    expect(typeof headerValue).toBe("string");
    expect((headerValue as string).length).toBeGreaterThan(0);
    expect(ctxRequestId).toBe(headerValue);
  });
});
