import { escapeCsv } from "@/lib/crypto";

export type Interval = { host: string; startedAt: number; endedAt: number };
export type CalendarEvent = { title: string; start: number; end: number; client?: string };
export type Block = {
  id: string;
  client: string;
  minutes: number;
  description: string;
  hosts: string[];
  approved: boolean;
};
export type Retainer = { client: string; budgetMinutes: number };

const MIN_INTERVAL_MS = 15_000;

export class BillableRecall {
  allowlist: string[] = [];
  intervals: Interval[] = [];
  events: CalendarEvent[] = [];
  blocks: Block[] = [];
  retainers: Retainer[] = [];
  paused = false;
  private active: { host: string; startedAt: number } | null = null;
  private idle = false;

  seedDemo() {
    this.allowlist = ["app.linear.app", "github.com", "docs.google.com"];
    this.retainers = [
      { client: "Northwind", budgetMinutes: 600 },
      { client: "Harbor", budgetMinutes: 240 },
    ];
    const day = new Date("2026-08-19T09:00:00Z").getTime();
    this.intervals = [
      { host: "app.linear.app", startedAt: day, endedAt: day + 48 * 60_000 },
      { host: "github.com", startedAt: day + 50 * 60_000, endedAt: day + 95 * 60_000 },
      { host: "docs.google.com", startedAt: day + 120 * 60_000, endedAt: day + 150 * 60_000 },
    ];
    this.events = [
      { title: "Northwind standup", start: day, end: day + 30 * 60_000, client: "Northwind" },
      { title: "Harbor SEO review", start: day + 120 * 60_000, end: day + 150 * 60_000, client: "Harbor" },
    ];
    this.rebuild();
  }

  setAllowlist(hosts: string[]) {
    this.allowlist = hosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
  }

  begin(url: string, at: number) {
    if (this.paused || this.idle) return;
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return;
    }
    if (!this.allowlist.includes(host)) return;
    this.active = { host, startedAt: at };
  }

  flush(at: number) {
    if (!this.active) return;
    if (at - this.active.startedAt >= MIN_INTERVAL_MS) {
      this.intervals.push({ host: this.active.host, startedAt: this.active.startedAt, endedAt: at });
    }
    this.active = null;
  }

  setIdle(idle: boolean, at: number) {
    if (idle) this.flush(at);
    this.idle = idle;
  }

  recoverFromCrash() {
    this.active = null;
  }

  importIcs(text: string) {
    const blocks = text.split("BEGIN:VEVENT").slice(1);
    for (const raw of blocks) {
      const summary = /SUMMARY:(.*)/.exec(raw)?.[1]?.trim() ?? "Event";
      const dtStart = /DTSTART[^\n:]*:(.*)/.exec(raw)?.[1]?.trim();
      const dtEnd = /DTEND[^\n:]*:(.*)/.exec(raw)?.[1]?.trim();
      if (!dtStart || !dtEnd) continue;
      this.events.push({
        title: summary,
        start: parseIcsDate(dtStart),
        end: parseIcsDate(dtEnd),
        client: guessClient(summary),
      });
    }
    this.rebuild();
  }

  rebuild() {
    const grouped = new Map<string, Block>();
    for (const interval of this.intervals) {
      const overlap = this.events.find((e) => e.start < interval.endedAt && e.end > interval.startedAt);
      const client = overlap?.client ?? guessClient(interval.host);
      const minutes = Math.round((interval.endedAt - interval.startedAt) / 60000);
      const existing = grouped.get(client);
      if (existing) {
        existing.minutes += minutes;
        if (!existing.hosts.includes(interval.host)) existing.hosts.push(interval.host);
      } else {
        grouped.set(client, {
          id: `${client}-${interval.startedAt}`,
          client,
          minutes,
          description: overlap ? overlap.title : `Work on ${interval.host}`,
          hosts: [interval.host],
          approved: false,
        });
      }
    }
    const previously = new Map(this.blocks.map((b) => [b.client, b]));
    this.blocks = [...grouped.values()].map((b) => ({
      ...b,
      approved: previously.get(b.client)?.approved ?? false,
      description: previously.get(b.client)?.description ?? b.description,
    }));
  }

  approve(id: string, description?: string) {
    const block = this.blocks.find((b) => b.id === id);
    if (!block) return;
    if (description !== undefined) block.description = description;
    block.approved = true;
  }

  exportApprovedCsv() {
    const rows = this.blocks.filter((b) => b.approved);
    const header = "client,minutes,description,hosts";
    const body = rows.map((b) =>
      [escapeCsv(b.client), b.minutes, escapeCsv(b.description), escapeCsv(b.hosts.join(" "))].join(","),
    );
    return [header, ...body].join("\n");
  }

  retainerStatus() {
    return this.retainers.map((r) => {
      const approved = this.blocks.filter((b) => b.client === r.client && b.approved).reduce((n, b) => n + b.minutes, 0);
      const draft = this.blocks.filter((b) => b.client === r.client && !b.approved).reduce((n, b) => n + b.minutes, 0);
      const used = approved + draft;
      return {
        ...r,
        approved,
        draft,
        remainingIfApproved: r.budgetMinutes - approved,
        remainingIfAll: r.budgetMinutes - used,
        warn: used / r.budgetMinutes >= 0.8,
      };
    });
  }

  wipe() {
    this.intervals = [];
    this.events = [];
    this.blocks = [];
    this.active = null;
  }

  persistedHosts() {
    return this.intervals.map((i) => i.host);
  }
}

function parseIcsDate(value: string) {
  const compact = value.replace(/[-:]/g, "");
  const y = Number(compact.slice(0, 4));
  const mo = Number(compact.slice(4, 6)) - 1;
  const d = Number(compact.slice(6, 8));
  const h = Number(compact.slice(9, 11) || 0);
  const mi = Number(compact.slice(11, 13) || 0);
  const s = Number(compact.slice(13, 15) || 0);
  return Date.UTC(y, mo, d, h, mi, s);
}

function guessClient(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("northwind") || lower.includes("linear") || lower.includes("github")) return "Northwind";
  if (lower.includes("harbor") || lower.includes("docs.google")) return "Harbor";
  return "Unassigned";
}

export const billableRecall = new BillableRecall();
billableRecall.seedDemo();
