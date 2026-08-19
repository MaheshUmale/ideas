"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

type Payload = {
  workflows: { id: string; name: string; clientName: string; status: string; lastSource?: string; lastDestination?: string; slaMinutes: number }[];
  incidents: { id: string; kind: string; status: string; correlationId: string | null }[];
  emails: { id: string; incidentId: string }[];
  events: { correlationId: string; stage: string; occurredAt: string }[];
};

export default function OutcomeWatchPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setData(await (await fetch("/api/outcome-watch")).json());
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function send(stage: "source" | "destination") {
    const r = await fetch("/api/v1/events", {
      method: "POST",
      headers: { authorization: "Bearer ow_live_demo_key_alpha", "content-type": "application/json" },
      body: JSON.stringify({
        correlationId: "lead-demo-42",
        stage,
        occurredAt: new Date().toISOString(),
        fields: { email: "pat@acme.test" },
      }),
    });
    setMsg(`${stage} → ${r.status}`);
    await refresh();
  }

  return (
    <ProductChrome slug="outcome-watch">
      <div className="flex flex-wrap gap-3 mb-8">
        <button className="border border-stone-400 px-3 py-2 bg-white" onClick={() => send("source")}>
          Emit source
        </button>
        <button className="border border-stone-400 px-3 py-2 bg-white" onClick={() => send("destination")}>
          Emit destination
        </button>
        <button
          className="border border-stone-400 px-3 py-2 bg-white"
          onClick={async () => {
            await fetch("/api/cron/evaluate", { method: "POST" });
            setMsg("evaluator ran");
            await refresh();
          }}
        >
          Run evaluator
        </button>
        <a className="border border-stone-400 px-3 py-2 bg-white" href="/status/status_acme_leads">
          Client status link
        </a>
        <span className="mono text-sm self-center">{msg}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {data?.workflows.map((wf) => (
          <article key={wf.id} aria-label={`${wf.name} health`} className="border border-stone-400 bg-white p-5">
            <div className="flex justify-between gap-3">
              <h2 className="text-2xl">{wf.name}</h2>
              <strong className="mono uppercase">{wf.status}</strong>
            </div>
            <p className="text-sm text-stone-600 mt-1">{wf.clientName} · SLA {wf.slaMinutes}m</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt>Last source</dt>
              <dd>{wf.lastSource ?? "Never"}</dd>
              <dt>Last destination</dt>
              <dd>{wf.lastDestination ?? "Never"}</dd>
            </dl>
          </article>
        ))}
      </div>
      <section className="mt-10">
        <h3 className="text-xl mb-3">Incidents / outbox</h3>
        <pre className="bg-stone-900 text-stone-100 p-4 overflow-auto text-xs">
          {JSON.stringify({ incidents: data?.incidents, emails: data?.emails }, null, 2)}
        </pre>
      </section>
    </ProductChrome>
  );
}
