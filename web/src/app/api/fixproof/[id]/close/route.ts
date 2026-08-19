import { fixProof } from "@/products/fixproof/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = fixProof.close(id, "manager");
  const status = result.kind === "ok" ? 200 : result.kind === "evidence_required" ? 409 : 404;
  return Response.json(result, { status });
}
