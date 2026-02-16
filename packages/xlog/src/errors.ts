import { NormalizedError } from "./types";

export function normalizeError(err: unknown): NormalizedError | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || "",
      stack: err.stack,
      cause: normalizeCause(err.cause)
    };
  }
  if (typeof err === "string") {
    return { name: "Error", message: err };
  }
  try {
    return { name: "Error", message: JSON.stringify(err) };
  } catch {
    return { name: "Error", message: String(err) };
  }
}

function normalizeCause(cause: unknown): string | undefined {
  if (!cause) return undefined;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
