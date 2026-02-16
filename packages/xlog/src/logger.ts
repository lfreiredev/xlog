import { normalizeError } from "./errors";
import { redactValue, resolveRedactOptions } from "./redact";
import { ConsoleSink } from "./sinks/console";
import { BufferConfig, BufferOptions, LogEvent, LogLevel, Logger, LoggerConfig, Sink } from "./types";

const LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

const DEFAULT_BUFFER: BufferOptions = {
  enabled: false,
  maxSize: 1000,
  flushIntervalMs: 50,
  backpressure: "drop",
  sampleRate: 0.1
};

export class LoggerImpl implements Logger {
  private readonly service: string;
  private readonly env: string;
  private readonly minLevel: LogLevel;
  private readonly context: Record<string, unknown>;
  private readonly sinks: Sink[];
  private readonly redact = resolveRedactOptions(undefined);
  private readonly contextProvider?: () => Record<string, unknown> | undefined;
  private readonly buffer?: BufferOptions;
  private readonly queue: LogEvent[] = [];
  private draining = false;
  private drainTimer?: NodeJS.Timeout;
  private flushWaiters: Array<() => void> = [];

  constructor(config: LoggerConfig) {
    this.service = config.service;
    this.env = config.env;
    this.minLevel = config.level ?? "info";
    this.context = { ...(config.context ?? {}) };
    this.redact = resolveRedactOptions(config.redact);
    this.sinks = config.sinks && config.sinks.length > 0 ? config.sinks : [new ConsoleSink()];
    this.contextProvider = config.contextProvider;
    this.buffer = resolveBufferOptions(config.buffer);
  }

  trace(msg: string, data?: Record<string, unknown> | Error): void {
    this.emit("trace", msg, data);
  }

  debug(msg: string, data?: Record<string, unknown> | Error): void {
    this.emit("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown> | Error): void {
    this.emit("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown> | Error): void {
    this.emit("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown> | Error): void {
    this.emit("error", msg, data);
  }

  fatal(msg: string, data?: Record<string, unknown> | Error): void {
    this.emit("fatal", msg, data);
  }

  with(ctx: Record<string, unknown>): Logger {
    return new LoggerImpl({
      service: this.service,
      env: this.env,
      level: this.minLevel,
      context: { ...this.context, ...ctx },
      redact: this.redact,
      sinks: this.sinks,
      contextProvider: this.contextProvider,
      buffer: this.buffer
    });
  }

  async flush(): Promise<void> {
    await this.drainAll();
    await Promise.all(this.sinks.map((sink) => sink.flush()));
  }

  private emit(level: LogLevel, msg: string, data?: Record<string, unknown> | Error): void {
    if (LEVELS[level] < LEVELS[this.minLevel]) return;

    if (this.buffer) {
      const full = this.queue.length >= this.buffer.maxSize;
      if (full) {
        if (this.buffer.backpressure === "drop") return;
        if (this.buffer.backpressure === "sample") {
          if (Math.random() > this.buffer.sampleRate) return;
          const event = this.buildEvent(level, msg, data);
          this.writeToSinks(event);
          return;
        }
      }

      if (full && this.buffer.backpressure === "sync") {
        const event = this.buildEvent(level, msg, data);
        this.writeToSinks(event);
        return;
      }

      const event = this.buildEvent(level, msg, data);
      this.queue.push(event);
      this.scheduleDrain();
      return;
    }

    const event = this.buildEvent(level, msg, data);
    this.writeToSinks(event);
  }

  private buildEvent(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown> | Error
  ): LogEvent {
    const provided = this.contextProvider ? this.contextProvider() : undefined;
    const mergedContext = { ...this.context, ...(provided ?? {}) };

    const { dataClean, err } = extractDataAndError(data);

    return {
      ts: new Date().toISOString(),
      level,
      msg,
      service: this.service,
      env: this.env,
      context: redactValue(mergedContext, this.redact),
      data: dataClean ? redactValue(dataClean, this.redact) : undefined,
      err
    };
  }

  private writeToSinks(event: LogEvent): void {
    for (const sink of this.sinks) {
      sink.write(event);
    }
  }

  private scheduleDrain(): void {
    if (!this.buffer) return;
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = undefined;
      this.drain();
      if (this.queue.length > 0) {
        this.scheduleDrain();
      }
    }, this.buffer.flushIntervalMs);
  }

  private async drainAll(): Promise<void> {
    if (!this.buffer) return Promise.resolve();
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = undefined;
    }
    if (this.queue.length === 0 && !this.draining) return Promise.resolve();
    await new Promise<void>((resolve) => {
      this.flushWaiters.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift();
        if (event) this.writeToSinks(event);
      }
    } finally {
      this.draining = false;
      if (this.queue.length === 0) {
        const waiters = this.flushWaiters;
        this.flushWaiters = [];
        for (const resolve of waiters) resolve();
      }
    }
  }
}

function extractDataAndError(
  data?: Record<string, unknown> | Error
): { dataClean?: Record<string, unknown>; err?: LogEvent["err"] } {
  if (!data) return {};
  if (data instanceof Error) {
    return { err: normalizeError(data) };
  }
  if (typeof data === "object" && data && "err" in data && data.err instanceof Error) {
    const { err, ...rest } = data as { err: Error } & Record<string, unknown>;
    return { dataClean: rest, err: normalizeError(err) };
  }
  return { dataClean: data as Record<string, unknown> };
}

function resolveBufferOptions(partial?: BufferConfig): BufferOptions | undefined {
  const enabled = partial?.enabled ?? DEFAULT_BUFFER.enabled;
  if (!enabled) return undefined;
  return {
    enabled: true,
    maxSize: partial?.maxSize ?? DEFAULT_BUFFER.maxSize,
    flushIntervalMs: partial?.flushIntervalMs ?? DEFAULT_BUFFER.flushIntervalMs,
    backpressure: partial?.backpressure ?? DEFAULT_BUFFER.backpressure,
    sampleRate: clamp01(partial?.sampleRate ?? DEFAULT_BUFFER.sampleRate)
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_BUFFER.sampleRate;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
