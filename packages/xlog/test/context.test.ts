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

describe("logger.with", () => {
  it("merges context without mutating parent", () => {
    const sink = new MemorySink();
    const base = createLogger({
      service: "svc",
      env: "test",
      context: { a: 1 },
      sinks: [sink]
    });
    const child = base.with({ b: 2 });
    child.info("child");
    base.info("base");

    expect(sink.events[0].context).toEqual({ a: 1, b: 2 });
    expect(sink.events[1].context).toEqual({ a: 1 });
  });
});
