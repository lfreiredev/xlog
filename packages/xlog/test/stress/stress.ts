import { performance } from "node:perf_hooks";
import { createLogger, Sink, LogEvent, BackpressurePolicy } from "../../src";

type Scenario = {
  name: string;
  makeSink: () => Sink;
  durationMs: number;
  maxSize: number;
  flushIntervalMs: number;
  sampleRate: number;
};

class CountingSink implements Sink {
  count = 0;
  write(_event: LogEvent): void {
    this.count += 1;
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

class SlowCountingSink implements Sink {
  count = 0;
  private readonly delayMs: number;
  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }
  write(_event: LogEvent): void {
    this.count += 1;
    busyWait(this.delayMs);
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

function busyWait(ms: number): void {
  const start = performance.now();
  while (performance.now() - start < ms) {
    // busy wait
  }
}

async function runPolicy(policy: BackpressurePolicy, scenario: Scenario): Promise<void> {
  const sink = scenario.makeSink() as CountingSink;
  const logger = createLogger({
    service: "stress",
    env: "test",
    sinks: [sink],
    buffer: {
      enabled: true,
      maxSize: scenario.maxSize,
      flushIntervalMs: scenario.flushIntervalMs,
      backpressure: policy,
      sampleRate: scenario.sampleRate
    }
  });

  const started = performance.now();
  let emitted = 0;
  while (performance.now() - started < scenario.durationMs) {
    logger.info("stress_event", { i: emitted });
    emitted += 1;
  }

  const flushStart = performance.now();
  await logger.flush();
  const flushMs = performance.now() - flushStart;

  const sinkCount = sink.count;
  const elapsed = performance.now() - started;
  const emittedPerSec = Math.round((emitted / elapsed) * 1000);
  const writtenPerSec = Math.round((sinkCount / elapsed) * 1000);

  const dropped = Math.max(0, emitted - sinkCount);
  const dropRate = emitted === 0 ? 0 : (dropped / emitted) * 100;

  // eslint-disable-next-line no-console
  console.log(
    [
      scenario.name,
      policy,
      `emitted=${emitted}`,
      `written=${sinkCount}`,
      `drop=${dropped} (${dropRate.toFixed(1)}%)`,
      `emit/s=${emittedPerSec}`,
      `write/s=${writtenPerSec}`,
      `flush=${flushMs.toFixed(1)}ms`
    ].join(" | ")
  );
}

async function runScenario(scenario: Scenario): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n== ${scenario.name} ==`);
  await runPolicy("drop", scenario);
  await runPolicy("sample", scenario);
  await runPolicy("sync", scenario);
}

async function main(): Promise<void> {
  const durationMs = Number(process.env.DURATION_MS ?? 2000);
  const maxSize = Number(process.env.MAX_SIZE ?? 1000);
  const flushIntervalMs = Number(process.env.FLUSH_INTERVAL_MS ?? 50);
  const sampleRate = Number(process.env.SAMPLE_RATE ?? 0.1);

  const fastScenario: Scenario = {
    name: "fast-sink",
    makeSink: () => new CountingSink(),
    durationMs,
    maxSize,
    flushIntervalMs,
    sampleRate
  };

  const slowScenario: Scenario = {
    name: "slow-sink-1ms",
    makeSink: () => new SlowCountingSink(1),
    durationMs,
    maxSize,
    flushIntervalMs,
    sampleRate
  };

  await runScenario(fastScenario);
  await runScenario(slowScenario);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
