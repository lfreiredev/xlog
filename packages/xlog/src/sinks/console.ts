import pc from "picocolors";
import { LogEvent, Sink } from "../types";

export interface ConsoleSinkOptions {
  pretty?: boolean;
}

export class ConsoleSink implements Sink {
  private readonly pretty: boolean;

  constructor(options?: ConsoleSinkOptions) {
    this.pretty = options?.pretty ?? process.env.NODE_ENV !== "production";
  }

  write(event: LogEvent): void {
    if (this.pretty) {
      const level = colorLevel(event.level);
      const base = `${event.ts} ${level} ${event.msg}`;
      const ctx = Object.keys(event.context).length > 0 ? ` ctx=${safeStringify(event.context)}` : "";
      const data = event.data ? ` data=${safeStringify(event.data)}` : "";
      const err = event.err ? ` err=${safeStringify(event.err)}` : "";
      // eslint-disable-next-line no-console
      console.log(base + ctx + data + err);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(event));
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}

function colorLevel(level: LogEvent["level"]): string {
  switch (level) {
    case "trace":
      return pc.gray("TRACE");
    case "debug":
      return pc.cyan("DEBUG");
    case "info":
      return pc.green("INFO");
    case "warn":
      return pc.yellow("WARN");
    case "error":
      return pc.red("ERROR");
    case "fatal":
      return pc.magenta("FATAL");
    default:
      return String(level).toUpperCase();
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable]";
  }
}
