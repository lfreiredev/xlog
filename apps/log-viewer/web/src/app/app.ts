import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from "@angular/core";
import DataTable from "datatables.net-dt";
import type { Api } from "datatables.net-dt";

type LogEvent = {
  ts: string;
  level: string;
  msg: string;
  service: string;
  env: string;
  context: Record<string, unknown>;
  data?: Record<string, unknown>;
  err?: Record<string, unknown>;
};

type LogRecord = {
  cursor: string;
  event: LogEvent;
};

type TableRow = {
  ts: string;
  level: string;
  msg: string;
  context: string;
  data: string;
  err: string;
};

@Component({
  selector: "app-root",
  standalone: true,
  templateUrl: "./app.html",
  styleUrl: "./app.css"
})
export class App implements AfterViewInit, OnDestroy {
  private readonly apiBase = "http://localhost:3000";
  private readonly initialLimit = 500;
  private readonly bufferCap = 2000;
  private stream?: EventSource;
  private dataTable?: Api<any>;

  records = signal<LogRecord[]>([]);
  loading = signal(false);
  loadingMore = signal(false);
  newCount = signal(0);
  isLive = signal(true);
  status = signal("Connecting…");

  @ViewChild("logContainer") logContainer?: ElementRef<HTMLDivElement>;
  @ViewChild("logTable") logTable?: ElementRef<HTMLTableElement>;

  async ngOnInit(): Promise<void> {
    await this.loadInitial();
    this.startStream();
  }

  ngAfterViewInit(): void {
    this.initDataTable();
    this.refreshTable();
  }

  ngOnDestroy(): void {
    this.stream?.close();
    if (this.dataTable) {
      this.dataTable.destroy(true);
    }
  }

  async loadInitial(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await fetch(`${this.apiBase}/logs?limit=${this.initialLimit}`);
      const data = (await res.json()) as { records: LogRecord[] };
      this.records.set(data.records ?? []);
      this.refreshTable();
      this.status.set("Live");
      this.scrollToBottom();
    } catch {
      this.status.set("Disconnected");
    } finally {
      this.loading.set(false);
    }
  }

  async loadOlder(): Promise<void> {
    const current = this.records();
    if (current.length === 0) return;
    this.loadingMore.set(true);
    const oldest = current[0].cursor;
    try {
      const res = await fetch(`${this.apiBase}/logs?limit=${this.initialLimit}&before=${oldest}`);
      const data = (await res.json()) as { records: LogRecord[] };
      const merged = [...(data.records ?? []), ...current];
      const trimmed = this.trimToCap(merged, "tail");
      this.records.set(trimmed);
      this.refreshTable();
    } finally {
      this.loadingMore.set(false);
    }
  }

  startStream(): void {
    const current = this.records();
    const from = current.length > 0 ? `?from=${current[current.length - 1].cursor}` : "";
    this.stream = new EventSource(`${this.apiBase}/logs/stream${from}`);
    this.stream.onmessage = (evt) => {
      const record = JSON.parse(evt.data) as LogRecord;
      this.appendRecord(record);
    };
    this.stream.onerror = () => {
      this.status.set("Disconnected");
    };
  }

  appendRecord(record: LogRecord): void {
    const next = [...this.records(), record];
    const trimmed = this.trimToCap(next, "head");
    this.records.set(trimmed);
    this.refreshTable();

    if (this.isLive()) {
      this.scrollToBottom();
    } else {
      this.newCount.set(this.newCount() + 1);
    }
  }

  onScroll(): void {
    const el = this.logContainer?.nativeElement;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    this.isLive.set(nearBottom);
    if (nearBottom) {
      this.newCount.set(0);
    }
  }

  jumpToLatest(): void {
    this.isLive.set(true);
    this.newCount.set(0);
    this.scrollToBottom();
  }

  private trimToCap(records: LogRecord[], dropSide: "head" | "tail"): LogRecord[] {
    if (records.length <= this.bufferCap) return records;
    const extra = records.length - this.bufferCap;
    return dropSide === "head" ? records.slice(extra) : records.slice(0, records.length - extra);
  }

  private initDataTable(): void {
    if (!this.logTable) return;
    this.dataTable = new DataTable(this.logTable.nativeElement, {
      data: [],
      columns: [
        { title: "", className: "dt-control", orderable: false, data: null, defaultContent: "" },
        { title: "Time", data: "ts" },
        {
          title: "Level",
          data: "level",
          render: (data: string, type: string) => {
            const level = String(data || "");
            if (type === "display") {
              return `<span class=\"level-chip level-${level.toLowerCase()}\">${level}</span>`;
            }
            return level;
          }
        },
        { title: "Message", data: "msg" },
        {
          title: "Context",
          data: "context",
          render: (data: string, type: string) => {
            return type === "display" ? data : data.replace(/<[^>]*>/g, "");
          }
        }
      ],
      columnDefs: [
        {
          targets: 4,
          createdCell: (cell, cellData) => {
            (cell as HTMLElement).innerHTML = cellData as string;
          }
        }
      ],
      pageLength: 100,
      ordering: false,
      info: true,
      searching: true,
      autoWidth: false,
      scrollY: "60vh",
      scrollCollapse: true
    });

    this.dataTable.on("click", "tbody td.dt-control", (event) => {
      const tr = (event.target as HTMLElement).closest("tr");
      if (!tr || !this.dataTable) return;
      const row = this.dataTable.row(tr);
      if (row.child.isShown()) {
        row.child.hide();
        tr.classList.remove("shown");
      } else {
        row.child(this.formatDetails(row.data() as TableRow)).show();
        tr.classList.add("shown");
      }
    });
  }

  private refreshTable(): void {
    if (!this.dataTable) return;
    const rows = this.records().map((rec) => this.toTableRow(rec));
    this.dataTable.clear();
    this.dataTable.rows.add(rows as any);
    this.dataTable.draw(false);
  }

  private toTableRow(rec: LogRecord): TableRow {
    return {
      ts: rec.event.ts ?? "",
      level: rec.event.level ?? "",
      msg: rec.event.msg ?? "",
      context: this.formatContextChips(rec.event.context),
      data: this.prettyJson(rec.event.data),
      err: this.prettyJson(rec.event.err)
    };
  }

  private formatContextChips(ctx?: Record<string, unknown>): string {
    if (!ctx || Object.keys(ctx).length === 0) return "";
    return Object.entries(ctx)
      .map(([key, value]) => {
        const val = this.escapeHtml(this.shortValue(value));
        const k = this.escapeHtml(key);
        return `<span class=\"chip\"><strong>${k}</strong><em>${val}</em></span>`;
      })
      .join(" ");
  }

  private shortValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }

  private formatDetails(row: TableRow): string {
    const data = row.data ? `<pre>${this.escapeHtml(row.data)}</pre>` : "<em>None</em>";
    const err = row.err ? `<pre>${this.escapeHtml(row.err)}</pre>` : "<em>None</em>";
    return `
      <div class=\"row-details\">
        <div>
          <h4>Data</h4>
          ${data}
        </div>
        <div>
          <h4>Error</h4>
          ${err}
        </div>
      </div>
    `;
  }

  private prettyJson(value?: Record<string, unknown>): string {
    if (!value || Object.keys(value).length === 0) return "";
    return JSON.stringify(value, null, 2);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private scrollToBottom(): void {
    const el = this.logContainer?.nativeElement;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }
}
