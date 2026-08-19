import { randomToken, sha256 } from "@/lib/crypto";

export type Entry = {
  externalId: string;
  account: string;
  date: string;
  debit: number;
  credit: number;
  entity?: string;
  className?: string;
  side: "source" | "destination";
};

export type CheckStatus = "pass" | "fail" | "unsupported";

export type Check = {
  code: string;
  status: CheckStatus;
  sourceValue: unknown;
  destinationValue: unknown;
};

export type Exception = {
  checkCode: string;
  severity: "error" | "warning";
  entityKey: string;
  explanation: string;
  sourceRefs: string[];
  destinationRefs: string[];
};

export type UploadedFile = {
  kind: string;
  side: "source" | "destination";
  name: string;
  sha256: string;
  rowCount: number;
};

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function money(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function signature(e: Omit<Entry, "side" | "externalId">) {
  return `${e.account}|${e.date}|${e.debit.toFixed(2)}|${e.credit.toFixed(2)}`;
}

export function aggregate(rows: Entry[]) {
  const out = new Map<string, number>();
  for (const r of rows) {
    out.set(r.account, (out.get(r.account) ?? 0) + r.debit - r.credit);
  }
  return out;
}

export class LedgerExit {
  files: UploadedFile[] = [];
  entries: Entry[] = [];
  checks: Check[] = [];
  exceptions: Exception[] = [];
  cutoff = "2025-12-31";
  status: "uploaded" | "queued" | "done" = "uploaded";

  required = ["source:trial_balance", "source:transactions", "destination:trial_balance", "destination:transactions"];

  reset() {
    this.files = [];
    this.entries = [];
    this.checks = [];
    this.exceptions = [];
    this.status = "uploaded";
  }

  ingest(side: "source" | "destination", kind: string, name: string, csv: string) {
    const rows = parseCsv(csv);
    this.files.push({ kind, side, name, sha256: sha256(csv), rowCount: rows.length });
    if (kind === "transactions" || kind === "trial_balance") {
      for (const row of rows) {
        this.entries.push({
          externalId: row.id || row.external_id || `${side}-${kind}-${rows.indexOf(row)}`,
          account: row.account || row.acct,
          date: row.date || this.cutoff,
          debit: money(row.debit || "0"),
          credit: money(row.credit || "0"),
          entity: row.entity || row.customer || row.vendor,
          className: row.class || row.tracking,
          side,
        });
      }
    }
    return rows.length;
  }

  missingFiles() {
    const have = new Set(this.files.map((f) => `${f.side}:${f.kind}`));
    return this.required.filter((r) => !have.has(r));
  }

  run(cutoff = this.cutoff) {
    const missing = this.missingFiles();
    if (missing.length) return { status: "missing_files" as const, missing };
    this.cutoff = cutoff;
    this.status = "done";
    this.checks = [];
    this.exceptions = [];

    const source = this.entries.filter((e) => e.side === "source" && e.date <= cutoff);
    const dest = this.entries.filter((e) => e.side === "destination" && e.date <= cutoff);

    this.checkBalances(source, dest);
    this.checkCounts(source, dest);
    this.checkDuplicates(source, dest);
    this.checkContacts(source, dest);
    this.checkClasses(source, dest);
    this.addUnsupported("payroll", "Payroll history is not verified in MVP.");
    this.addUnsupported("attachments", "Attachment binaries are checksummed only when a manifest is supplied.");
    return { status: "done" as const, checks: this.checks, exceptions: this.exceptions };
  }

  checkBalances(source: Entry[], dest: Entry[]) {
    const sa = aggregate(source);
    const da = aggregate(dest);
    const accounts = [...new Set([...sa.keys(), ...da.keys()])].sort();
    const balances = accounts.map((account) => {
      const s = sa.get(account) ?? 0;
      const d = da.get(account) ?? 0;
      const delta = Math.round((s - d) * 100) / 100;
      if (delta !== 0) {
        this.exceptions.push({
          checkCode: "trial_balance",
          severity: "error",
          entityKey: account,
          explanation: `Account ${account} differs by ${delta.toFixed(2)}.`,
          sourceRefs: source.filter((e) => e.account === account).map((e) => e.externalId),
          destinationRefs: dest.filter((e) => e.account === account).map((e) => e.externalId),
        });
      }
      return { account, source: s, destination: d, delta };
    });
    this.checks.push({
      code: "trial_balance",
      status: balances.every((b) => b.delta === 0) ? "pass" : "fail",
      sourceValue: Object.fromEntries(sa),
      destinationValue: Object.fromEntries(da),
    });
  }

  checkCounts(source: Entry[], dest: Entry[]) {
    const sTotal = source.reduce((n, e) => n + e.debit - e.credit, 0);
    const dTotal = dest.reduce((n, e) => n + e.debit - e.credit, 0);
    const ok = source.length === dest.length && Math.round((sTotal - dTotal) * 100) === 0;
    if (!ok) {
      this.exceptions.push({
        checkCode: "transaction_counts",
        severity: "error",
        entityKey: "transactions",
        explanation: `Source has ${source.length} rows / ${sTotal.toFixed(2)} net; destination has ${dest.length} / ${dTotal.toFixed(2)}.`,
        sourceRefs: source.map((e) => e.externalId),
        destinationRefs: dest.map((e) => e.externalId),
      });
    }
    this.checks.push({
      code: "transaction_counts",
      status: ok ? "pass" : "fail",
      sourceValue: { count: source.length, net: sTotal },
      destinationValue: { count: dest.length, net: dTotal },
    });
  }

  checkDuplicates(source: Entry[], dest: Entry[]) {
    const findDupes = (rows: Entry[]) => {
      const map = new Map<string, string[]>();
      for (const row of rows) {
        const key = signature(row);
        map.set(key, [...(map.get(key) ?? []), row.externalId]);
      }
      return [...map.entries()].filter(([, ids]) => ids.length > 1);
    };
    const destDupes = findDupes(dest);
    for (const [key, ids] of destDupes) {
      this.exceptions.push({
        checkCode: "duplicates",
        severity: "error",
        entityKey: key,
        explanation: "Duplicate destination signature.",
        sourceRefs: [],
        destinationRefs: ids,
      });
    }
    const sourceKeys = new Set(source.map((e) => signature(e)));
    for (const row of dest) {
      if (!sourceKeys.has(signature(row))) {
        this.exceptions.push({
          checkCode: "duplicates",
          severity: "warning",
          entityKey: row.externalId,
          explanation: "Destination row has no matching source signature.",
          sourceRefs: [],
          destinationRefs: [row.externalId],
        });
      }
    }
    const destKeys = new Set(dest.map((e) => signature(e)));
    for (const row of source) {
      if (!destKeys.has(signature(row))) {
        this.exceptions.push({
          checkCode: "duplicates",
          severity: "error",
          entityKey: row.externalId,
          explanation: "Source row missing from destination.",
          sourceRefs: [row.externalId],
          destinationRefs: [],
        });
      }
    }
    this.checks.push({
      code: "duplicates",
      status: destDupes.length || this.exceptions.some((e) => e.checkCode === "duplicates" && e.severity === "error")
        ? "fail"
        : "pass",
      sourceValue: source.length,
      destinationValue: dest.length,
    });
  }

  checkContacts(source: Entry[], dest: Entry[]) {
    const names = (rows: Entry[]) => new Set(rows.map((r) => r.entity).filter(Boolean) as string[]);
    const s = names(source);
    const d = names(dest);
    const missing = [...s].filter((n) => !d.has(n));
    if (missing.length) {
      this.exceptions.push({
        checkCode: "contacts",
        severity: "warning",
        entityKey: missing.join(","),
        explanation: "Contacts present in source are missing in destination.",
        sourceRefs: missing,
        destinationRefs: [],
      });
    }
    this.checks.push({
      code: "contacts",
      status: missing.length ? "fail" : "pass",
      sourceValue: [...s],
      destinationValue: [...d],
    });
  }

  checkClasses(source: Entry[], dest: Entry[]) {
    const names = (rows: Entry[]) => new Set(rows.map((r) => r.className).filter(Boolean) as string[]);
    const s = names(source);
    const d = names(dest);
    const missing = [...s].filter((n) => !d.has(n));
    this.checks.push({
      code: "classes",
      status: missing.length ? "fail" : "pass",
      sourceValue: [...s],
      destinationValue: [...d],
    });
    if (missing.length) {
      this.exceptions.push({
        checkCode: "classes",
        severity: "warning",
        entityKey: missing.join(","),
        explanation: "Tracking classes did not transfer.",
        sourceRefs: missing,
        destinationRefs: [],
      });
    }
  }

  addUnsupported(code: string, reason: string) {
    this.checks.push({ code, status: "unsupported", sourceValue: null, destinationValue: reason });
  }

  report() {
    const tested = this.checks.filter((c) => c.status !== "unsupported");
    return {
      cutoff: this.cutoff,
      files: this.files,
      checks: this.checks,
      exceptions: this.exceptions,
      tested: tested.length,
      passed: tested.filter((c) => c.status === "pass").length,
      failed: tested.filter((c) => c.status === "fail").length,
      unsupported: this.checks.filter((c) => c.status === "unsupported").map((c) => c.code),
      disclaimer: "This report lists tested checks only. Unsupported domains are never counted as pass. Not a migration certification.",
    };
  }

  seedDemo() {
    this.reset();
    this.ingest(
      "source",
      "trial_balance",
      "qb-tb.csv",
      "account,debit,credit,date\n1000 Checking,12000,0,2025-12-31\n4000 Revenue,0,12000,2025-12-31",
    );
    this.ingest(
      "destination",
      "trial_balance",
      "xero-tb.csv",
      "account,debit,credit,date\n1000 Checking,11850,0,2025-12-31\n4000 Revenue,0,12000,2025-12-31",
    );
    this.ingest(
      "source",
      "transactions",
      "qb-txn.csv",
      "id,account,date,debit,credit,entity,class\nT1,1000 Checking,2025-06-01,12000,0,Acme,Ops\nT2,4000 Revenue,2025-06-01,0,12000,Acme,Ops\nT3,1000 Checking,2025-11-02,150,0,North,Ops\nT4,4000 Revenue,2025-11-02,0,150,North,Ops",
    );
    this.ingest(
      "destination",
      "transactions",
      "xero-txn.csv",
      "id,account,date,debit,credit,entity,class\nX1,1000 Checking,2025-06-01,12000,0,Acme,Ops\nX2,4000 Revenue,2025-06-01,0,12000,Acme,Ops\nX3,1000 Checking,2025-11-02,150,0,North,Ops\nX3b,1000 Checking,2025-11-02,150,0,North,Ops",
    );
    this.run();
  }
}

export const ledgerExit = new LedgerExit();
ledgerExit.seedDemo();
