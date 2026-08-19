"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

export default function DisputePage() {
  const [data, setData] = useState<{
    disputes: {
      id: string;
      reasonCode: string;
      amountCents: number;
      dueAt: string;
      refundWarning: string | null;
      checklist: { label: string; state: "present" | "missing"; source?: string }[];
    }[];
    packets: { version: number; sha256: string; body: string }[];
  } | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    setData(await (await fetch("/api/disputes")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  const dispute = data?.disputes[0];

  return (
    <ProductChrome slug="dispute-packet">
      {dispute && (
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <p className="mono text-sm">
              {dispute.reasonCode} · ${(dispute.amountCents / 100).toFixed(2)} · due {dispute.dueAt.slice(0, 10)}
            </p>
            {dispute.refundWarning && (
              <p className="mt-3 border border-red-800 bg-red-50 p-3">{dispute.refundWarning}</p>
            )}
            <ul className="mt-4 space-y-2">
              {dispute.checklist.map((i) => (
                <li key={i.label} className="flex gap-2">
                  <span aria-label={i.state}>{i.state === "present" ? "✓" : "!"}</span>
                  {i.label}
                  {i.source && <small> — {i.source}</small>}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 mt-6">
              <button
                className="border border-stone-400 px-3 py-2 bg-white"
                onClick={async () => {
                  await fetch("/api/disputes", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      action: "evidence",
                      disputeId: dispute.id,
                      item: { kind: "delivery", source: "upload", occurredAt: new Date().toISOString(), facts: { photo: "porch.jpg" } },
                    }),
                  });
                  await load();
                }}
              >
                Upload delivery photo
              </button>
              <button
                className="border border-stone-400 px-3 py-2 bg-white"
                onClick={async () => {
                  const r = await fetch("/api/disputes", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "packet", disputeId: dispute.id }),
                  });
                  setMsg(r.ok ? "Packet versioned" : "Packet blocked");
                  await load();
                }}
              >
                Generate packet
              </button>
            </div>
            <p className="mt-3 text-sm">{msg}</p>
          </section>
          <pre className="bg-slate-900 text-slate-100 p-4 text-xs overflow-auto min-h-64">
            {data.packets.at(-1)?.body ?? "No packet yet."}
          </pre>
        </div>
      )}
    </ProductChrome>
  );
}
