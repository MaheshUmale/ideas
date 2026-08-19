"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

export default function ReportNarratorPage() {
  const [data, setData] = useState<{
    clients: { id: string; name: string }[];
    reports: {
      id: string;
      clientId: string;
      body: string;
      stale: boolean;
      checklist: { id: string; label: string; done: boolean }[];
      citations: { claim: string; range: string }[];
    }[];
  } | null>(null);
  const [exportMsg, setExportMsg] = useState("");

  async function load() {
    setData(await (await fetch("/api/reports")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  const report = data?.reports.at(-1);

  return (
    <ProductChrome slug="report-narrator">
      <div className="flex flex-wrap gap-3 mb-6">
        {data?.clients.map((c) => (
          <button
            key={c.id}
            className="border border-stone-400 px-3 py-2 bg-white"
            onClick={async () => {
              await fetch("/api/reports", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "generate", clientId: c.id }),
              });
              await load();
            }}
          >
            Generate {c.name}
          </button>
        ))}
        <button
          className="border border-stone-400 px-3 py-2 bg-white"
          onClick={async () => {
            await fetch("/api/reports", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "cell", range: "Metrics!B2", value: 15000 }),
            });
            await load();
          }}
        >
          Edit source cell
        </button>
      </div>
      {report && (
        <div className="grid md:grid-cols-2 gap-8">
          <pre className="bg-white border border-stone-400 p-5 whitespace-pre-wrap">{report.body}</pre>
          <div>
            {report.stale && <p className="bg-amber-100 border border-amber-700 p-3 mb-4">Source changed — report is stale and approval is revoked.</p>}
            <ul className="space-y-2">
              {report.checklist.map((c) => (
                <li key={c.id}>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={async () => {
                        await fetch("/api/reports", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ action: "check", reportId: report.id, checkId: c.id }),
                        });
                        await load();
                      }}
                    />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
            <button
              className="mt-4 bg-stone-900 text-white px-4 py-2"
              onClick={async () => {
                const r = await (
                  await fetch("/api/reports", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "export", reportId: report.id }),
                  })
                ).json();
                setExportMsg(r.ok ? "PDF export unlocked" : `Blocked: ${r.error}`);
              }}
            >
              Export PDF
            </button>
            <p className="mt-3 text-sm">{exportMsg}</p>
            <ul className="mt-6 text-sm text-stone-600">
              {report.citations.map((c) => (
                <li key={c.range}>
                  {c.range}: {c.claim}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </ProductChrome>
  );
}
