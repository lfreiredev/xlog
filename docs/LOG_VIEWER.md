# Log Viewer

This app provides a live tail UI (SSE) plus history paging over the WAL store.

## Layout

- API: `apps/log-viewer/api` (NestJS)
- UI: `apps/log-viewer/web` (Angular standalone)

## API

### Env

Copy `apps/log-viewer/api/.env.example` to `.env` and adjust as needed.

- `WAL_DIR`: path to the WAL directory
- `PORT`: API port
- `FRONTEND_ORIGIN`: CORS origin for the UI
- `DATABASE_URL`: Postgres (reserved for saved views; not required yet)

### Run

```sh
pnpm --filter log-viewer-api start:dev
```

### Endpoints

- `GET /logs?limit=500&before=<cursor>`: fetch the latest or older logs
- `GET /logs/stream?from=<cursor>`: SSE stream of new logs

## UI

### Run

```sh
pnpm --filter log-viewer-web start
```

Default UI behavior:
- Initial load: 500 records
- Buffer cap: 2000 records
- New logs badge when scrolled up

## Notes

- The UI expects the API at `http://localhost:3000`. Update `apiBase` in
  `apps/log-viewer/web/src/app/app.ts` if needed.
