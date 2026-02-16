export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
  cause?: string;
}

export interface LogEvent {
  ts: string;
  level: LogLevel;
  msg: string;
  service: string;
  env: string;
  context: Record<string, unknown>;
  data?: Record<string, unknown>;
  err?: NormalizedError;
}

export type BackpressurePolicy = "drop" | "sample" | "sync";

export interface BufferOptions {
  enabled: boolean;
  maxSize: number;
  flushIntervalMs: number;
  backpressure: BackpressurePolicy;
  sampleRate: number;
}

export type BufferConfig = Partial<BufferOptions> & { enabled?: boolean };

export interface Logger {
  trace(msg: string, data?: Record<string, unknown> | Error): void;
  debug(msg: string, data?: Record<string, unknown> | Error): void;
  info(msg: string, data?: Record<string, unknown> | Error): void;
  warn(msg: string, data?: Record<string, unknown> | Error): void;
  error(msg: string, data?: Record<string, unknown> | Error): void;
  fatal(msg: string, data?: Record<string, unknown> | Error): void;
  with(ctx: Record<string, unknown>): Logger;
  flush(): Promise<void>;
}

export interface Sink {
  write(event: LogEvent): void;
  flush(): Promise<void>;
}

export interface RedactOptions {
  keys: string[];
  mask: string;
  maxDepth: number;
}

export interface LoggerConfig {
  service: string;
  env: string;
  level?: LogLevel;
  context?: Record<string, unknown>;
  redact?: Partial<RedactOptions>;
  sinks?: Sink[];
  contextProvider?: () => Record<string, unknown> | undefined;
  buffer?: BufferConfig;
}
