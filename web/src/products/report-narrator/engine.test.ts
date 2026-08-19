import { describe, expect, it } from "vitest";
import { ReportNarrator, insight, replacePlaceholders } from "./engine";

describe("ReportNarrator insights", () => {
  it("handles zero previous, negatives, targets, and rounding", () => {
    expect(insight({ key: "x", label: "Leads", current: 10, previous: 0, sourceRange: "A1" })).toContain("increased");
    expect(insight({ key: "x", label: "ROAS", current: -2, previous: -1, sourceRange: "A1" })).toContain("decreased");
    expect(insight({ key: "x", label: "CPA", current: 90, target: 100, sourceRange: "A1" })).toContain("below target");
    expect(insight({ key: "x", label: "Spend", current: 1000, sourceRange: "A1" })).toBe("Spend is 1,000.");
  });

  it("fails before generating when a placeholder is missing", () => {
    expect(() => replacePlaceholders("Hello {{client}}", { client: "A", spend: "1" })).toThrow(
      /Missing placeholder: spend/,
    );
  });
});

describe("ReportNarrator isolation", () => {
  it("does not leak values across sequential clients", () => {
    const app = new ReportNarrator();
    app.seedDemo();
    const a = app.generate("northwind", new Date("2026-08-19T00:00:00Z"));
    const b = app.generate("harbor", new Date("2026-08-19T00:01:00Z"));
    expect(a.body).toContain("Northwind Bikes");
    expect(a.body).not.toContain("Harbor Dental");
    expect(b.body).toContain("Harbor Dental");
    expect(b.body).not.toContain("12,400");
  });

  it("marks stale and blocks export until checklist is complete", () => {
    const app = new ReportNarrator();
    app.seedDemo();
    const report = app.generate("northwind");
    expect(app.exportPdf(report.id).error).toBe("checklist_incomplete");
    app.setCell("Metrics!B2", 99999);
    expect(app.reports[0].stale).toBe(true);
    expect(app.exportPdf(report.id).error).toBe("stale");
  });
});
