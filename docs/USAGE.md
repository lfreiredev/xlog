# xlog Usage Cookbook

This is a practical summary of how to use `xlog` as it exists in this repo.

## Quick Start

```ts
import { createLogger, ConsoleSink } from "xlog";

const logger = createLogger({
  service: "api",
  env: process.env.NODE_ENV ?? "development",
  sinks: [new ConsoleSink({ pretty: true })]
});

logger.info("server_started", { port: 3000 });
```

## Log Levels

```ts
logger.trace("trace_msg");
logger.debug("debug_msg");
logger.info("info_msg");
logger.warn("warn_msg");
logger.error("error_msg");
logger.fatal("fatal_msg");
```

## Attach Data

```ts
logger.info("order_created", { orderId: "o_123", total: 42.5 });
```

## Log Errors

```ts
try {
  throw new Error("Boom");
} catch (err) {
  logger.error("request_failed", err as Error);
  logger.error("request_failed_with_data", { err, code: "E_DEMO" });
}
```

## Add Context

```ts
const scoped = logger.with({ requestId: "r_123", userId: "u_456" });
scoped.info("request_start");
```

## Dynamic Context Provider

```ts
const logger = createLogger({
  service: "api",
  env: "dev",
  contextProvider: () => ({ requestId: getCurrentRequestId() })
});
```

## Async Buffered Logging

Enable async buffering to reduce sync write overhead. The queue is bounded; when full,
apply a backpressure policy:

- `drop`: drop new events
- `sample`: drop most events based on `sampleRate` (0–1)
- `sync`: write immediately when full

```ts
const logger = createLogger({
  service: "api",
  env: "dev",
  buffer: {
    enabled: true,
    maxSize: 5000,
    flushIntervalMs: 50,
    backpressure: "drop",
    sampleRate: 0.1
  }
});
```

## Redaction

By default, `xlog` redacts keys:
`authorization`, `cookie`, `password`, `token`, `secret`.

```ts
const logger = createLogger({
  service: "api",
  env: "dev",
  redact: { keys: ["password", "token"], mask: "***", maxDepth: 4 }
});
```

## File Sink

```ts
import { FileSink } from "xlog";

const logger = createLogger({
  service: "api",
  env: "dev",
  sinks: [
    new FileSink({
      filePath: "./logs/app.log",
      maxBytes: 5_000_000,
      batch: { maxEvents: 100, maxBytes: 64_000, flushIntervalMs: 100 }
    })
  ]
});
```

## Console Sink

```ts
import { ConsoleSink } from "xlog";

const logger = createLogger({
  service: "api",
  env: "dev",
  sinks: [new ConsoleSink({ pretty: true })]
});
```

## Example Endpoints (Nest)

In `examples/nest-api`, the controller exposes:

- `GET /hello` basic logging + requestId
- `GET /with-context` child logger via `logger.with`
- `GET /data` structured data payload
- `GET /error` error logging
- `GET /redact` redaction demo
- `GET /async` async ALS context demo
- `POST /echo` request body logging
- `POST /login` redaction demo (password/token)
- `POST /order` request body + ALS context

Sample `curl` calls:

```sh
curl -s http://localhost:3000/hello
curl -s http://localhost:3000/with-context
curl -s http://localhost:3000/data
curl -s http://localhost:3000/error
curl -s http://localhost:3000/redact
curl -s http://localhost:3000/async

curl -s -X POST http://localhost:3000/echo \
  -H 'content-type: application/json' \
  -d '{"hello":"world","count":1}'

curl -s -X POST http://localhost:3000/login \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"super-secret","token":"abc123"}'

curl -s -X POST http://localhost:3000/order \
  -H 'content-type: application/json' \
  -d '{"orderId":"o_789","total":99.5}'
```

Note: when using `xlog-nest`, logs are flushed automatically on app shutdown.

## V3 WAL Store (Preview)

The V3 store is an append-only, segmented log store with per-record checksums and
indexes for time + requestId/traceId.

```ts
import { WalWriter, WalReader } from "xlog";

const writer = new WalWriter({
  dir: "./logs/wal",
  segmentMaxBytes: 256 * 1024 * 1024,
  indexStride: 100,
  enableTraceIndex: true,
  enableRequestIndex: true
});

writer.write({
  ts: new Date().toISOString(),
  level: "info",
  msg: "hello",
  service: "api",
  env: "prod",
  context: { requestId: "r1", traceId: "t1" }
});

writer.close();

const reader = new WalReader("./logs/wal");
for (const rec of reader.scanByRequestId("r1")) {
  console.log(rec.event.msg);
}
```

For full details, see `docs/V3_SPEC.md`.
