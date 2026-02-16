import { RedactOptions } from "./types";

const DEFAULT_REDACT: RedactOptions = {
  keys: ["authorization", "cookie", "password", "token", "secret"],
  mask: "[REDACTED]",
  maxDepth: 6
};

export function resolveRedactOptions(partial?: Partial<RedactOptions>): RedactOptions {
  return {
    keys: partial?.keys ?? DEFAULT_REDACT.keys,
    mask: partial?.mask ?? DEFAULT_REDACT.mask,
    maxDepth: partial?.maxDepth ?? DEFAULT_REDACT.maxDepth
  };
}

export function redactValue<T>(value: T, options: RedactOptions): T {
  const seen = new WeakMap<object, unknown>();
  const lowerKeys = new Set(options.keys.map((k) => k.toLowerCase()));

  function walk(val: unknown, depth: number): unknown {
    if (val === null || val === undefined) return val;
    if (depth > options.maxDepth) return "[MaxDepth]";
    if (typeof val !== "object") return val;

    if (seen.has(val as object)) return "[Circular]";
    seen.set(val as object, true);

    if (Array.isArray(val)) {
      return val.map((item) => walk(item, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
      if (lowerKeys.has(key.toLowerCase())) {
        out[key] = options.mask;
      } else {
        out[key] = walk(child, depth + 1);
      }
    }
    return out;
  }

  return walk(value, 0) as T;
}
