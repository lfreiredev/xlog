import { LoggerImpl } from "./logger";
import { Logger, LoggerConfig } from "./types";

export function createLogger(config: LoggerConfig): Logger {
  return new LoggerImpl(config);
}
