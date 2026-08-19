import { outcomeWatch } from "@/products/outcome-watch/engine";

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = outcomeWatch.publicStatus(token);
  if (!status) {
    return (
      <main className="p-10">
        <p>Status link not found.</p>
      </main>
    );
  }
  return (
    <main className="p-10 max-w-lg">
      <p className="mono text-xs uppercase tracking-widest">Client reliability</p>
      <h1 className="text-4xl mt-2">{status.name}</h1>
      <p className="mt-4 text-2xl">{status.status}</p>
      <p className="mt-6 text-sm text-stone-600">Last source: {status.lastSource ?? "Never"}</p>
      <p className="text-sm text-stone-600">Last destination: {status.lastDestination ?? "Never"}</p>
    </main>
  );
}
