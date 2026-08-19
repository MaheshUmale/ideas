"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

type Report = {
  cutoff: string;
  checks: { code: string; status: string }[];
  exceptions: { checkCode: string; explanation: string; sourceRefs: string[]; destinationRefs: string[] }[];
  passed: number;
  failed: number;
  unsupported: string[];
  disclaimer: string;
  files: { name: string; sha256: string; rowCount: number }[];
};

export default function LedgerExitPage() {
  const [report, setReport] = useState<Report | null>(null);

  async function load() {
    setReport(await (await fetch("/api/migrations")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <ProductChrome slug="ledger-exit">
      <p className="max-w-2xl mb-6">{report?.disclaimer}</p>
      <div className="flex gap-6 mb-6 text-sm">
        <span>Passed {report?.passed}</span>
        <span>Failed {report?.failed}</span>
        <span>Unsupported {report?.unsupported.join(", ")}</span>
      </div>
      <table className="w-full bg-white border border-stone-400 text-sm">
        <thead>
          <tr className="bg-green-50">
            <th className="text-left p-3">Check</th>
            <th className="text-left p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {report?.checks.map((c) => (
            <tr key={c.code} className="border-t">
              <td className="p-3">{c.code}</td>
              <td className="p-3 uppercase">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="text-xl mt-8 mb-2">Exceptions</h2>
      <ul className="space-y-2">
        {report?.exceptions.map((e, i) => (
          <li key={i} className="border border-stone-400 bg-white p-3 text-sm">
            <strong>{e.checkCode}</strong> — {e.explanation}
            <div className="mono text-xs mt-1">src {e.sourceRefs.join(",") || "—"} · dst {e.destinationRefs.join(",") || "—"}</div>
          </li>
        ))}
      </ul>
      <h2 className="text-xl mt-8 mb-2">Archive manifest</h2>
      <ul className="mono text-xs">
        {report?.files.map((f) => (
          <li key={f.sha256}>
            {f.name} · {f.rowCount} rows · {f.sha256.slice(0, 16)}
          </li>
        ))}
      </ul>
    </ProductChrome>
  );
}
