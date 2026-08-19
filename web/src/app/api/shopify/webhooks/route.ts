import { disputePacket } from "@/products/dispute-packet/engine";

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const provided = req.headers.get("x-shopify-hmac-sha256");
  const webhookId = req.headers.get("x-shopify-webhook-id");
  const result = disputePacket.verifyWebhook(raw, provided, webhookId);
  if (result.status === 401) return new Response("invalid hmac", { status: 401 });
  return new Response(null, { status: 200 });
}
