import { disputePacket } from "@/products/dispute-packet/engine";

export async function GET() {
  return Response.json({
    shops: disputePacket.shops.map((s) => ({ ...s, accessTokenCiphertext: s.accessTokenCiphertext ? "[redacted]" : "" })),
    disputes: disputePacket.disputes.map((d) => ({
      ...d,
      checklist: disputePacket.checklist(d),
      refundWarning: d.status === "open" ? "Do not refund while this dispute is open." : null,
    })),
    evidence: disputePacket.evidence,
    packets: disputePacket.packets,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "evidence") {
    return Response.json(disputePacket.addEvidence(body.disputeId, body.item));
  }
  if (body.action === "packet") {
    try {
      return Response.json(disputePacket.generatePacket(body.disputeId, body.claims ?? []));
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 400 });
    }
  }
  if (body.action === "refund") return Response.json(disputePacket.flagRefund(body.disputeId));
  return Response.json({ error: "unknown_action" }, { status: 400 });
}
