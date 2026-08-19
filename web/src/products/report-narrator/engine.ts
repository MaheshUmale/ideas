export type Metric = {
  key: string;
  label: string;
  current: number;
  previous?: number;
  target?: number;
  sourceRange: string;
};

export type Mapping = { placeholder: string; range: string };
export type ClientConfig = { id: string; name: string; mappings: Mapping[]; templateId: string };

export function insight(m: Metric): string {
  if (m.target !== undefined) {
    const denom = Math.abs(m.target || 1);
    const d = (m.current - m.target) / denom;
    if (Math.abs(d) >= 0.05) {
      return `${m.label} is ${Math.abs(d * 100).toFixed(1)}% ${d > 0 ? "above" : "below"} target.`;
    }
  }
  if (m.previous !== undefined) {
    const denom = Math.abs(m.previous || 1);
    const d = (m.current - m.previous) / denom;
    return `${m.label} ${d >= 0 ? "increased" : "decreased"} ${Math.abs(d * 100).toFixed(1)}% versus the previous period.`;
  }
  return `${m.label} is ${m.current.toLocaleString("en-US")}.`;
}

export function replacePlaceholders(template: string, values: Record<string, string>) {
  let text = template;
  for (const [key] of Object.entries(values)) {
    const token = `{{${key}}}`;
    if (!template.includes(token)) throw new Error(`Missing placeholder: ${key}`);
  }
  for (const [key, value] of Object.entries(values)) {
    text = text.split(`{{${key}}}`).join(value);
  }
  return text;
}

export type GeneratedReport = {
  id: string;
  clientId: string;
  createdAt: string;
  refreshAt: string;
  body: string;
  citations: { claim: string; range: string }[];
  stale: boolean;
  checklist: { id: string; label: string; done: boolean }[];
  sourceFingerprint: string;
};

export class ReportNarrator {
  clients: ClientConfig[] = [];
  sheets = new Map<string, Record<string, number | string>>();
  reports: GeneratedReport[] = [];
  template = [
    "Monthly performance — {{client}}",
    "Period: {{period}}",
    "{{spend_insight}} ({{spend_cite}})",
    "{{roas_insight}} ({{roas_cite}})",
    "{{leads_insight}} ({{leads_cite}})",
  ].join("\n");

  seedDemo() {
    this.clients.push({
      id: "northwind",
      name: "Northwind Bikes",
      templateId: "tmpl-monthly",
      mappings: [
        { placeholder: "spend", range: "Metrics!B2" },
        { placeholder: "roas", range: "Metrics!B3" },
        { placeholder: "leads", range: "Metrics!B4" },
      ],
    });
    this.clients.push({
      id: "harbor",
      name: "Harbor Dental",
      templateId: "tmpl-monthly",
      mappings: [
        { placeholder: "spend", range: "Metrics!C2" },
        { placeholder: "roas", range: "Metrics!C3" },
        { placeholder: "leads", range: "Metrics!C4" },
      ],
    });
    this.sheets.set("workbook", {
      "Metrics!B2": 12400,
      "Metrics!B3": 3.4,
      "Metrics!B4": 86,
      "Metrics!C2": 6100,
      "Metrics!C3": 5.1,
      "Metrics!C4": 41,
      period: "August 2026",
    });
  }

  fingerprint(clientId: string) {
    const client = this.mustClient(clientId);
    const sheet = this.sheets.get("workbook")!;
    return JSON.stringify(client.mappings.map((m) => [m.range, sheet[m.range]]));
  }

  generate(clientId: string, now = new Date()) {
    const client = this.mustClient(clientId);
    const sheet = this.sheets.get("workbook");
    if (!sheet) throw new Error("missing_sheet");
    const metrics: Metric[] = client.mappings.map((m) => {
      const current = Number(sheet[m.range]);
      if (Number.isNaN(current)) throw new Error(`Missing range ${m.range}`);
      return {
        key: m.placeholder,
        label: m.placeholder === "roas" ? "ROAS" : m.placeholder[0].toUpperCase() + m.placeholder.slice(1),
        current,
        previous: m.placeholder === "spend" ? current * 0.92 : current * 0.97,
        target: m.placeholder === "roas" ? 4 : undefined,
        sourceRange: m.range,
      };
    });
    const values: Record<string, string> = {
      client: client.name,
      period: String(sheet.period ?? ""),
    };
    const citations: GeneratedReport["citations"] = [];
    for (const metric of metrics) {
      const claim = insight(metric);
      values[`${metric.key}_insight`] = claim;
      values[`${metric.key}_cite`] = `${metric.sourceRange} @ ${now.toISOString()}`;
      citations.push({ claim, range: metric.sourceRange });
    }
    const body = replacePlaceholders(this.template, values);
    const report: GeneratedReport = {
      id: `${clientId}-${now.getTime()}`,
      clientId,
      createdAt: now.toISOString(),
      refreshAt: now.toISOString(),
      body,
      citations,
      stale: false,
      sourceFingerprint: this.fingerprint(clientId),
      checklist: [
        { id: "fresh", label: "Metrics match mapped cells", done: true },
        { id: "identity", label: "Client identity confirmed", done: false },
        { id: "range", label: "Date range confirmed", done: false },
        { id: "review", label: "Human review complete", done: false },
      ],
    };
    this.reports.push(report);
    return report;
  }

  markStale() {
    for (const report of this.reports) {
      if (report.sourceFingerprint !== this.fingerprint(report.clientId)) {
        report.stale = true;
        const review = report.checklist.find((c) => c.id === "review");
        if (review) review.done = false;
      }
    }
  }

  setCell(range: string, value: number | string) {
    const sheet = this.sheets.get("workbook");
    if (!sheet) return;
    sheet[range] = value;
    this.markStale();
  }

  toggleCheck(reportId: string, checkId: string) {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report || report.stale) return null;
    const item = report.checklist.find((c) => c.id === checkId);
    if (item) item.done = !item.done;
    return report;
  }

  exportPdf(reportId: string) {
    const report = this.reports.find((r) => r.id === reportId);
    if (!report) return { ok: false as const, error: "missing" };
    if (report.stale) return { ok: false as const, error: "stale" };
    if (!report.checklist.every((c) => c.done)) return { ok: false as const, error: "checklist_incomplete" };
    return { ok: true as const, body: report.body };
  }

  mustClient(id: string) {
    const client = this.clients.find((c) => c.id === id);
    if (!client) throw new Error("unknown_client");
    return client;
  }
}

export const reportNarrator = new ReportNarrator();
reportNarrator.seedDemo();
