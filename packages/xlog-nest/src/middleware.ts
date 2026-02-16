import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Logger } from "xlog";
import { ALSContext } from "./context";
import { APP_LOGGER } from "./tokens";
import { Inject } from "@nestjs/common";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly als: ALSContext,
    @Inject(APP_LOGGER) private readonly logger: Logger
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers["x-request-id"];
    const requestId = Array.isArray(header) ? header[0] : header || randomUUID();
    res.setHeader("x-request-id", requestId);

    const start = process.hrtime.bigint();

    this.als.runWithContext({ requestId }, () => {
      const method = req.method;
      const url = (req as any).originalUrl ?? req.url;
      this.logger.info("request_start", { method, url });

      res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        this.logger.info("request_end", {
          method,
          url,
          statusCode: res.statusCode,
          durationMs
        });
      });

      next();
    });
  }
}
