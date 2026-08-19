import { fixProof } from "@/products/fixproof/engine";

export async function GET() {
  return Response.json({
    properties: fixProof.properties,
    workOrders: fixProof.workOrders,
    assignments: fixProof.assignments.map((a) => ({ ...a, tokenHash: undefined })),
    photos: fixProof.photos,
    updates: fixProof.updates,
    notices: fixProof.notices,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const created = fixProof.create(body);
  return Response.json(created, { status: 201 });
}
