# XLog V3 Storage Spec (Draft)

## Goals

- Append-only segmented log store (WAL-like).
- Per-record checksum for corruption detection.
- Segment index by time + requestId/traceId.
- Recovery on crash (truncate partial record).

## Segment Files

- Default segment size: 256 MB.
- Configurable via `segment_max_bytes`.
- Naming: `xlog.<segmentStartTsMs>.<seq>.wal` (draft; exact naming TBD).

## Record Format (Binary Envelope + JSON)

Each record is a binary header followed by JSON payload bytes.

### Header (little-endian)

- `magic` (u32): `0x584C4F47` ("XLOG")
- `version` (u16): `1`
- `flags` (u16): reserved
- `ts_ms` (u64): event timestamp (ms since epoch)
- `len` (u32): payload length in bytes (JSON UTF-8)
- `checksum` (u64): xxHash64 over **header fields + payload**
  - Proposed checksum input: `version|flags|ts_ms|len|payload`
  - `magic` not included in checksum.

### Payload

- UTF-8 JSON representation of a `LogEvent`.
- JSON is not compressed in v3. (Future option)

## Index Files

Index is per-segment to support time + requestId/traceId lookups.

### Time Index

- File: `xlog.<segmentStartTsMs>.<seq>.time.idx`
- Entries: `[ts_ms (u64), offset (u64)]`
- Entries can be sparse (e.g., every N records) to balance size vs search.

### Trace Index

- File: `xlog.<segmentStartTsMs>.<seq>.trace.idx`
- Entries: `[trace_id_hash (u64), offset (u64)]`
- `trace_id_hash` is xxHash64 of traceId string.

### Request Index

- File: `xlog.<segmentStartTsMs>.<seq>.req.idx`
- Entries: `[request_id_hash (u64), offset (u64)]`
- `request_id_hash` is xxHash64 of requestId string.

## Write Path (WAL)

1. Serialize `LogEvent` to JSON bytes.
2. Build header.
3. Compute checksum over header fields + payload.
4. Append header + payload to current segment.
5. Update indexes.
6. Rotate when `segment_max_bytes` would be exceeded.

## Read Path

- Sequential scan or indexed seeks.
- Validate `magic`, `version`, `len`.
- Validate checksum; if mismatch, treat as corruption.

## Recovery

On startup:

- For the latest segment, scan sequentially.
- If a record is partial or checksum invalid, truncate file at last known-good offset.
- Rebuild/repair indexes if offsets exceed segment size.

## Configuration

- `segment_max_bytes` (default: 268_435_456)
- `index_stride` (records between time index entries; default TBD)
- `enable_trace_index`, `enable_request_index`

## Open Questions

- Exact naming scheme for segments/indexes.
- Whether to include level/service in index (currently no).
- Compression and optional binary payload in future.
