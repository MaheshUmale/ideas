"use client";

import { useEffect, useState } from "react";

export default function VendorPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [assignment, setAssignment] = useState<{ summary: string; status: string } | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void params.then(async ({ token: t }) => {
      setToken(t);
      const r = await fetch(`/api/public/assignments/${t}`);
      if (r.ok) setAssignment(await r.json());
    });
  }, [params]);

  if (!assignment) return <main className="p-10">Assignment not found or expired.</main>;

  return (
    <main className="p-8 max-w-lg">
      <h1 className="text-3xl">{assignment.summary}</h1>
      <p className="mt-2">Status: {assignment.status}</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await fetch(`/api/public/assignments/${token}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "accept" }),
          });
          const photo = await (
            await fetch(`/api/public/assignments/${token}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "photo", kind: "after", name: "after.jpg", mime: "image/jpeg" }),
            })
          ).json();
          const done = await fetch(`/api/public/assignments/${token}/complete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note, afterPhotoIds: [photo.photo.id] }),
          });
          setMsg(done.ok ? "Proof submitted — awaiting manager verification." : "Could not submit proof.");
        }}
      >
        <textarea className="w-full border border-stone-400 p-2" required value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="bg-sky-900 text-white px-4 py-2">Submit completion proof</button>
      </form>
      <p className="mt-4">{msg}</p>
    </main>
  );
}
