import { DynamicModule, Module } from "@nestjs/common";
import type { Logger } from "xlog";
import { ALSContext } from "./context";
import { APP_LOGGER } from "./tokens";
import { XLogShutdown } from "./shutdown";

export interface XLogModuleOptions {
  logger: Logger;
  als?: ALSContext;
}

@Module({})
export class XLogModule {
  static forRoot(options: XLogModuleOptions): DynamicModule {
    const als = options.als ?? new ALSContext();
    return {
      module: XLogModule,
      providers: [
        { provide: APP_LOGGER, useValue: options.logger },
        { provide: ALSContext, useValue: als },
        XLogShutdown
      ],
      exports: [APP_LOGGER, ALSContext]
    };
  }
}
