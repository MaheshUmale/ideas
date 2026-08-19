"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatUsd } from "@/lib/money";

export default function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<{ title: string; totalCents: number; status: string; scope: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    void params.then(async ({ token: t }) => {
      setToken(t);
      const r = await fetch(`/api/public/change-orders/${t}`);
      if (!r.ok) setError("This approval link is invalid or expired.");
      else setOrder(await r.json());
    });
  }, [params]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const clicked = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
    const r = await fetch(`/api/public/change-orders/${token}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: new FormData(form).get("signerName"), decision: clicked.value }),
    });
    if (!r.ok) {
      setError("Decision could not be saved");
      return;
    }
    setDone("Decision recorded");
  }

  if (error) return <main className="p-10">{error}</main>;
  if (!order) return <main className="p-10">Loading…</main>;
  if (done) return <main className="p-10 text-2xl">{done}</main>;

  return (
    <main className="p-10 max-w-lg">
      <p className="mono text-xs uppercase">Change order approval</p>
      <h1 className="text-3xl mt-2">{order.title}</h1>
      <p className="mt-3 text-stone-700">{order.scope}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <p>
          Total: <strong>{formatUsd(order.totalCents)}</strong>
        </p>
        <label className="block">
          Name
          <input required name="signerName" className="mt-1 w-full border border-stone-400 p-2 bg-white" />
        </label>
        <div className="flex gap-3">
          <button name="decision" value="approved" className="bg-stone-900 text-white px-4 py-2">
            Approve
          </button>
          <button name="decision" value="rejected" className="border border-stone-400 px-4 py-2 bg-white">
            Reject
          </button>
        </div>
      </form>
    </main>
  );
}
