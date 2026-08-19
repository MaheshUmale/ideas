import { describe, expect, it } from "vitest";
import { LedgerExit, money, parseCsv } from "./engine";

describe("LedgerExit", () => {
  it("normalizes locale decimals without dropping totals", () => {
    expect(money("12,50")).toBe(12.5);
    const rows = parseCsv('id,account,date,debit,credit\n1,1000,2025-01-01,"1,00",0');
    expect(money(rows[0].debit)).toBe(1);
  });

  it("detects a missing source row and a destination duplicate", () => {
    const job = new LedgerExit();
    job.seedDemo();
    const missing = job.exceptions.find((e) => e.explanation.includes("missing from destination"));
    const dupe = job.exceptions.find((e) => e.explanation.includes("Duplicate destination"));
    expect(missing).toBeTruthy();
    expect(dupe).toBeTruthy();
    expect(job.checks.find((c) => c.code === "trial_balance")?.status).toBe("fail");
    expect(job.checks.find((c) => c.code === "payroll")?.status).toBe("unsupported");
    const report = job.report();
    expect(report.unsupported).toContain("payroll");
    expect(report.passed + report.failed).toBe(report.tested);
  });

  it("refuses to run without the prescribed files", () => {
    const job = new LedgerExit();
    const result = job.run();
    expect(result.status).toBe("missing_files");
  });
});
