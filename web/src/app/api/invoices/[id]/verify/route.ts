import { plateDelta } from "@/products/plate-delta/engine";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lines = await req.json();
  try {
    const result = plateDelta.verify(id, lines, 500);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
