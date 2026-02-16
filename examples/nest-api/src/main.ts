import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createLogger, FileSink } from "xlog";
import { createNestLogger, ALSContext } from "xlog-nest";
import { ConsoleSink } from "xlog";

async function bootstrap() {
  const als = new ALSContext();
  const logger = createLogger({
    service: "nest-api",
    env: process.env.NODE_ENV ?? "development",
    contextProvider: () => als.getContext(),
    sinks: [new ConsoleSink({ pretty: true }), new FileSink({ filePath: "./logs/app.log", maxBytes: 5_000_000 })]
  });

  const app = await NestFactory.create(AppModule.forRoot({ logger, als }));
  app.useLogger(createNestLogger(logger));

  await app.listen(3000);
  logger.info("server_started", { port: 3000 });
}

bootstrap();
