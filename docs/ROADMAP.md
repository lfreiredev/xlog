# XLog Roadmap

## v1 (MVP - shippable)
- xlog core: levels, event shape, child contexts, redaction, console sink, file sink (JSONL with rotation)
- xlog-nest: LoggerService adapter + ALS request context middleware + example app

## v2 (Reliability)
- async buffered logging with bounded queue
- backpressure policy (drop debug, sample, or block)
- batching for file writes
- optional HTTP sink with retries
- flush on shutdown (Nest lifecycle hook)

## v3 (Storage-engine-ish)
- append-only segmented log store (WAL-like) instead of naive JSONL
- per-record checksum
- segment index by time + requestId/traceId
- recovery on crash (truncate partial record)
- CLI enhancements: range queries, by-trace timeline

## v4 (Observability layer)
- “incident bundle” exporter for time windows
- correlation graph by requestId/traceId
- deploy markers + config markers
