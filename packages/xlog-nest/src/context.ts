import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextStore {
  requestId: string;
  [key: string]: unknown;
}

export class ALSContext {
  private readonly als = new AsyncLocalStorage<ContextStore>();

  runWithContext<T>(ctx: ContextStore, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  getContext(): ContextStore | undefined {
    return this.als.getStore();
  }
}

export function runWithContext<T>(als: ALSContext, ctx: ContextStore, fn: () => T): T {
  return als.runWithContext(ctx, fn);
}

export function getContext(als: ALSContext): ContextStore | undefined {
  return als.getContext();
}
