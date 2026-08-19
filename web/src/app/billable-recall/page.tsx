"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

export default function BillableRecallPage() {
  const [data, setData] = useState<{
    allowlist: string[];
    blocks: { id: string; client: string; minutes: number; description: string; approved: boolean; hosts: string[] }[];
    retainers: { client: string; budgetMinutes: number; approved: number; draft: number; warn: boolean }[];
    paused: boolean;
    csv: string;
  } | null>(null);

  async function load() {
    setData(await (await fetch("/api/billable")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  async function act(body: object) {
    await fetch("/api/billable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  return (
    <ProductChrome slug="billable-recall">
      <p className="mb-4 text-sm">Nothing is uploaded until you approve the entry. Hostnames only — never path, title, or content.</p>
      <div className="flex flex-wrap gap-3 mb-6">
        <button className="border border-stone-400 px-3 py-2 bg-white" onClick={() => act({ action: "pause", paused: !data?.paused })}>
          {data?.paused ? "Resume" : "Pause"} capture
        </button>
        <button className="border border-stone-400 px-3 py-2 bg-white" onClick={() => act({ action: "visit", url: "https://mail.secret.test/inbox", ms: 120000 })}>
          Visit non-allowlisted mail
        </button>
        <button className="border border-stone-400 px-3 py-2 bg-white" onClick={() => act({ action: "wipe" })}>
          Delete local data
        </button>
        <button className="border border-stone-400 px-3 py-2 bg-white" onClick={() => act({ action: "seed" })}>
          Restore demo day
        </button>
      </div>
      <p className="mono text-xs mb-4">Allow-list: {data?.allowlist.join(", ")}</p>
      <div className="grid md:grid-cols-2 gap-8">
        <section className="space-y-3">
          {data?.blocks.map((b) => (
            <article key={b.id} className="border border-stone-400 bg-white p-4">
              <div className="flex justify-between">
                <strong>{b.client}</strong>
                <span>{b.minutes} min</span>
              </div>
              <p className="text-sm mt-1">{b.description}</p>
              <p className="mono text-xs text-stone-500">{b.hosts.join(" ")}</p>
              {!b.approved && (
                <button className="mt-3 border px-3 py-1" onClick={() => act({ action: "approve", id: b.id })}>
                  Approve
                </button>
              )}
            </article>
          ))}
        </section>
        <section>
          <h2 className="text-xl mb-2">Retainers</h2>
          <ul className="space-y-2 mb-6">
            {data?.retainers.map((r) => (
              <li key={r.client} className="border border-stone-400 p-3 bg-white">
                {r.client}: approved {r.approved}m / draft {r.draft}m / budget {r.budgetMinutes}m
                {r.warn && <em className="block">Approaching budget</em>}
              </li>
            ))}
          </ul>
          <h2 className="text-xl mb-2">Approved CSV</h2>
          <pre className="bg-stone-900 text-stone-100 p-3 text-xs overflow-auto">{data?.csv}</pre>
        </section>
      </div>
    </ProductChrome>
  );
}
