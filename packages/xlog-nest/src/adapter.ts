import type { LoggerService } from "@nestjs/common";
import type { Logger } from "xlog";

export function createNestLogger(core: Logger): LoggerService {
  return {
    log(message: any, context?: string) {
      core.info(String(message), context ? { context } : undefined);
    },
    error(message: any, trace?: string, context?: string) {
      core.error(String(message), {
        context,
        trace
      });
    },
    warn(message: any, context?: string) {
      core.warn(String(message), context ? { context } : undefined);
    },
    debug(message: any, context?: string) {
      core.debug(String(message), context ? { context } : undefined);
    },
    verbose(message: any, context?: string) {
      core.trace(String(message), context ? { context } : undefined);
    }
  };
}
