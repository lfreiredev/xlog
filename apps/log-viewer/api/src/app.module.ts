import { Module } from "@nestjs/common";
import { LogsController } from "./logs/logs.controller";
import { LogsService } from "./logs/logs.service";

@Module({
  imports: [],
  controllers: [LogsController],
  providers: [LogsService]
})
export class AppModule {}
