import { plateDelta } from "@/products/plate-delta/engine";

export async function GET() {
  return new Response(plateDelta.verifiedCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}
