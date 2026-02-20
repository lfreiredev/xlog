import { WalWriter } from "xlog";

const WAL_DIR = process.env.WAL_DIR ?? "/Users/lfreiredev/Projects/Personal/xlog/logs/wal";
const writer = new WalWriter({ dir: WAL_DIR });

const now = Date.now();
const levels = ["info", "warn", "error", "debug"] as const;

for (let i = 0; i < 3000; i += 1) {
  const ts = new Date(now + i * 1000).toISOString();
  const level = levels[i % levels.length];
  const requestId = `req-${Math.floor(i / 3)}`;
  const traceId = "trace-demo";

  writer.write({
    ts,
    level,
    msg: `job_step_${i}`,
    service: "sync-worker",
    env: "dev",
    context: {
      requestId,
      traceId,
      job: "nightly-sync",
      step: i,
      host: "worker-01"
    },
    data: {
      batchId: `batch-${Math.floor(i / 5)}`,
      durationMs: Math.round(Math.random() * 2000),
      items: Math.round(Math.random() * 500),
      payload: {
        region: "us-east-1",
        accountId: `acct-${1000 + i}`,
        featureFlags: ["fast-path", "retryable"],
        meta: { attempt: (i % 3) + 1 }
      }
    },
    err:
      level === "error"
        ? {
            name: "SyncError",
            message: "Remote API timeout",
            stack: "Error: Remote API timeout\n    at syncJob (worker.ts:42:13)",
            cause: "ETIMEDOUT"
          }
        : undefined
  });
}

writer.close();
console.log(`Wrote 3000 dummy records to ${WAL_DIR}`);
