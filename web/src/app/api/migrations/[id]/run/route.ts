import { ledgerExit } from "@/products/ledger-exit/engine";

export async function POST() {
  const missing = ledgerExit.missingFiles();
  if (missing.length) return Response.json({ error: "missing_files", missing }, { status: 409 });
  return Response.json(ledgerExit.run(), { status: 202 });
}
