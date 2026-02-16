import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { Logger } from "xlog";
import { APP_LOGGER } from "./tokens";

@Injectable()
export class XLogShutdown implements OnApplicationShutdown {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}

  async onApplicationShutdown(): Promise<void> {
    await this.logger.flush();
  }
}
