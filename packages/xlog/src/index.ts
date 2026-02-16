export { createLogger } from "./public";
export type {
  BackpressurePolicy,
  BufferConfig,
  BufferOptions,
  LogEvent,
  LogLevel,
  Logger,
  LoggerConfig,
  Sink,
  RedactOptions
} from "./types";
export { ConsoleSink } from "./sinks/console";
export { FileSink } from "./sinks/file";
export { redactValue, resolveRedactOptions } from "./redact";
