import { fixProof } from "@/products/fixproof/engine";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = fixProof.vendorView(token);
  if (!view) return Response.json({ error: "invalid" }, { status: 404 });
  return Response.json(view);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  if (body.action === "accept") return Response.json(fixProof.accept(token));
  if (body.action === "photo") return Response.json(fixProof.addPhoto(token, body.kind, body.name, body.mime));
  return Response.json(fixProof.complete(token, body));
}
