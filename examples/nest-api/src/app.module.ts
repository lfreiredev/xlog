import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { XLogModule, RequestContextMiddleware, ALSContext, APP_LOGGER } from "xlog-nest";
import type { Logger } from "xlog";
import { AppController } from "./app.controller";

export interface AppModuleOptions {
  logger: Logger;
  als: ALSContext;
}

@Module({
  controllers: [AppController]
})
export class AppModule implements NestModule {
  static forRoot(options: AppModuleOptions) {
    return {
      module: AppModule,
      imports: [XLogModule.forRoot({ logger: options.logger, als: options.als })],
      providers: [
        { provide: ALSContext, useValue: options.als },
        { provide: APP_LOGGER, useValue: options.logger }
      ]
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
