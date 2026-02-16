import { describe, expect, it } from "vitest";
import { createLogger, LogEvent, Sink } from "../src";

class MemorySink implements Sink {
  events: LogEvent[] = [];
  write(event: LogEvent): void {
    this.events.push(event);
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

describe("buffered logging", () => {
  it("buffers events until flush", async () => {
    const sink = new MemorySink();
    const logger = createLogger({
      service: "svc",
      env: "test",
      sinks: [sink],
      buffer: { enabled: true, maxSize: 10, flushIntervalMs: 10_000 }
    });

    logger.info("hello");
    expect(sink.events.length).toBe(0);

    await logger.flush();
    expect(sink.events.length).toBe(1);
    expect(sink.events[0].msg).toBe("hello");
  });

  it("drops when queue is full and policy is drop", async () => {
    const sink = new MemorySink();
    const logger = createLogger({
      service: "svc",
      env: "test",
      sinks: [sink],
      buffer: { enabled: true, maxSize: 1, flushIntervalMs: 10_000, backpressure: "drop" }
    });

    logger.info("first");
    logger.info("second");
    await logger.flush();

    expect(sink.events.length).toBe(1);
    expect(sink.events[0].msg).toBe("first");
  });

  it("writes synchronously when queue is full and policy is sync", async () => {
    const sink = new MemorySink();
    const logger = createLogger({
      service: "svc",
      env: "test",
      sinks: [sink],
      buffer: { enabled: true, maxSize: 1, flushIntervalMs: 10_000, backpressure: "sync" }
    });

    logger.info("first");
    logger.info("second");
    expect(sink.events.length).toBe(1);
    expect(sink.events[0].msg).toBe("second");

    await logger.flush();
    expect(sink.events.length).toBe(2);
    expect(sink.events[1].msg).toBe("first");
  });
});
