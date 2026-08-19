import { ledgerExit } from "@/products/ledger-exit/engine";

export async function GET() {
  return Response.json(ledgerExit.report());
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "reset") {
    ledgerExit.reset();
    return Response.json({ ok: true });
  }
  if (body.action === "ingest") {
    const count = ledgerExit.ingest(body.side, body.kind, body.name, body.csv);
    return Response.json({ rowCount: count, missing: ledgerExit.missingFiles() });
  }
  if (body.action === "run") {
    const missing = ledgerExit.missingFiles();
    if (missing.length) return Response.json({ error: "missing_files", missing }, { status: 409 });
    return Response.json(ledgerExit.run(body.cutoff), { status: 202 });
  }
  if (body.action === "demo") {
    ledgerExit.seedDemo();
    return Response.json(ledgerExit.report());
  }
  return Response.json({ error: "unknown_action" }, { status: 400 });
}
