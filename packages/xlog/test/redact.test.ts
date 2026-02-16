import { describe, expect, it } from "vitest";
import { redactValue, resolveRedactOptions } from "../src/redact";

describe("redactValue", () => {
  it("redacts deep keys including arrays and handles cycles", () => {
    const input: Record<string, unknown> = {
      user: {
        name: "Ada",
        password: "secret"
      },
      tokens: [
        { token: "abc" },
        { token: "def" }
      ]
    };
    input.self = input;

    const out = redactValue(input, resolveRedactOptions(undefined)) as Record<string, unknown>;

    const user = out.user as Record<string, unknown>;
    expect(user.password).toBe("[REDACTED]");
    const tokens = out.tokens as Array<Record<string, unknown>>;
    expect(tokens[0].token).toBe("[REDACTED]");
    expect(out.self).toBe("[Circular]");
  });
});
