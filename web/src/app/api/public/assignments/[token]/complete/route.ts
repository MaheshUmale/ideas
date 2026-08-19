import { fixProof } from "@/products/fixproof/engine";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = fixProof.complete(token, await req.json());
  const status = result.kind === "ok" ? 200 : result.kind === "bad_evidence" ? 400 : 404;
  return Response.json(result, { status });
}
