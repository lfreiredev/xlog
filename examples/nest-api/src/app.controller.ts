import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { APP_LOGGER, ALSContext } from "xlog-nest";
import type { Logger } from "xlog";

@Controller()
export class AppController {
  constructor(
    @Inject(APP_LOGGER) private readonly logger: Logger,
    @Inject(ALSContext) private readonly als: ALSContext
  ) {}

  @Get("/hello")
  hello() {
    const ctx = this.als.getContext();
    this.logger.info("hello_route", { route: "/hello" });
    return { ok: true, requestId: ctx?.requestId };
  }

  @Get("/with-context")
  withContext() {
    const scoped = this.logger.with({ feature: "with-context", userId: "u_123" });
    scoped.info("scoped_log", { action: "viewed" });
    return { ok: true };
  }

  @Get("/data")
  data() {
    this.logger.info("data_payload", { orderId: "o_456", total: 42.5 });
    return { ok: true };
  }

  @Get("/error")
  error() {
    const err = new Error("Example failure");
    this.logger.error("example_error", err);
    this.logger.error("example_error_with_data", { err, code: "E_DEMO" });
    return { ok: false };
  }

  @Get("/redact")
  redact() {
    this.logger.info("redact_demo", {
      user: "alice",
      password: "super-secret",
      token: "abc123"
    });
    return { ok: true };
  }

  @Get("/async")
  async asyncContext() {
    await sleep(1000);
    const ctx = this.als.getContext();
    this.logger.info("async_context", { requestId: ctx?.requestId });
    return { ok: true, requestId: ctx?.requestId };
  }

  @Post("/echo")
  echo(@Body() body: Record<string, unknown>) {
    this.logger.info("echo_body", { body });
    return { ok: true, body };
  }

  @Post("/login")
  login(@Body() body: Record<string, unknown>) {
    this.logger.info("login_attempt", {
      username: body["username"],
      password: body["password"],
      token: body["token"]
    });
    return { ok: true };
  }

  @Post("/order")
  order(@Body() body: Record<string, unknown>) {
    const ctx = this.als.getContext();
    this.logger.info("order_created", {
      requestId: ctx?.requestId,
      orderId: body["orderId"],
      total: body["total"]
    });
    return { ok: true, orderId: body["orderId"] };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
