import { hmacSha256Base64, randomToken, sha256, timingSafeEqualString } from "@/lib/crypto";

export type ReasonCode = "product_not_received" | "not_as_described" | "credit_not_processed" | "fraudulent" | "subscription_canceled";

export const CHECKLIST: Record<ReasonCode, string[]> = {
  product_not_received: ["order", "fulfillment", "tracking", "delivery", "policy"],
  not_as_described: ["order", "product_description", "photos", "policy", "customer_message"],
  credit_not_processed: ["order", "refund", "return", "policy"],
  fraudulent: ["order", "avs_cvv", "ip_device", "policy_acceptance", "fulfillment"],
  subscription_canceled: ["order", "cancellation_request", "policy", "access_log"],
};

export type Shop = { id: string; shopDomain: string; accessTokenCiphertext: string; uninstalledAt: string | null };
export type Dispute = {
  id: string;
  shopId: string;
  externalId: string;
  reasonCode: ReasonCode;
  amountCents: number;
  currency: string;
  dueAt: string;
  status: "open" | "submitted" | "won" | "lost";
  refundedWhileOpen: boolean;
};
export type EvidenceItem = {
  id: string;
  disputeId: string;
  kind: string;
  source: string;
  occurredAt: string | null;
  facts: Record<string, string>;
  sha256: string | null;
};
export type PacketVersion = { id: string; disputeId: string; version: number; sha256: string; createdAt: string; body: string };
export type WebhookRecord = { id: string };

export class DisputePacket {
  shops: Shop[] = [];
  disputes: Dispute[] = [];
  evidence: EvidenceItem[] = [];
  packets: PacketVersion[] = [];
  webhooks = new Set<string>();
  secret = "shpss_demo_secret";

  seedDemo() {
    this.shops.push({
      id: "shop-1",
      shopDomain: "ridge-goods.myshopify.com",
      accessTokenCiphertext: "enc:demo",
      uninstalledAt: null,
    });
    const dispute: Dispute = {
      id: "disp-1",
      shopId: "shop-1",
      externalId: "gid://shopify/Dispute/9001",
      reasonCode: "product_not_received",
      amountCents: 24800,
      currency: "USD",
      dueAt: new Date(Date.now() + 5 * 864e5).toISOString(),
      status: "open",
      refundedWhileOpen: false,
    };
    this.disputes.push(dispute);
    this.addEvidence(dispute.id, {
      kind: "order",
      source: "shopify",
      occurredAt: "2026-08-02T14:11:00Z",
      facts: { orderName: "#1842", email: "a***@mail.test", total: "248.00" },
    });
    this.addEvidence(dispute.id, {
      kind: "fulfillment",
      source: "shopify",
      occurredAt: "2026-08-03T09:00:00Z",
      facts: { carrier: "USPS", tracking: "9400 1111 2222" },
    });
    this.addEvidence(dispute.id, {
      kind: "tracking",
      source: "upload",
      occurredAt: "2026-08-06T16:40:00Z",
      facts: { status: "Delivered, front door" },
    });
    this.addEvidence(dispute.id, {
      kind: "policy",
      source: "shopify",
      occurredAt: "2026-08-02T14:11:05Z",
      facts: { checkoutAcceptance: "shipping policy accepted" },
    });
    return dispute;
  }

  verifyWebhook(raw: Buffer, hmacHeader: string | null, webhookId: string | null) {
    if (!hmacHeader || !webhookId) return { status: 401 as const };
    const expected = hmacSha256Base64(this.secret, raw);
    if (!timingSafeEqualString(hmacHeader, expected)) return { status: 401 as const };
    if (this.webhooks.has(webhookId)) return { status: 200 as const, duplicate: true };
    this.webhooks.add(webhookId);
    return { status: 200 as const, duplicate: false };
  }

  uninstall(shopId: string) {
    const shop = this.shops.find((s) => s.id === shopId);
    if (!shop) return;
    shop.uninstalledAt = new Date().toISOString();
    shop.accessTokenCiphertext = "";
    this.disputes = this.disputes.filter((d) => d.shopId !== shopId);
    this.evidence = this.evidence.filter((e) => this.disputes.some((d) => d.id === e.disputeId));
  }

  usableToken(shopId: string) {
    const shop = this.shops.find((s) => s.id === shopId);
    return Boolean(shop && !shop.uninstalledAt && shop.accessTokenCiphertext);
  }

  addEvidence(disputeId: string, item: Omit<EvidenceItem, "id" | "disputeId" | "sha256">) {
    const row: EvidenceItem = {
      ...item,
      id: randomToken(8),
      disputeId,
      sha256: sha256(JSON.stringify(item.facts)),
    };
    this.evidence.push(row);
    return row;
  }

  checklist(dispute: Dispute) {
    const required = CHECKLIST[dispute.reasonCode];
    const present = new Set(this.evidence.filter((e) => e.disputeId === dispute.id).map((e) => e.kind));
    return required.map((label) => ({
      label,
      state: present.has(label) ? ("present" as const) : ("missing" as const),
      source: this.evidence.find((e) => e.disputeId === dispute.id && e.kind === label)?.source,
    }));
  }

  claimAllowed(disputeId: string, claim: string) {
    if (claim === "customer never contacted us") {
      const messages = this.evidence.filter((e) => e.disputeId === disputeId && e.kind === "customer_message");
      return messages.length === 0 && this.evidence.some((e) => e.disputeId === disputeId && e.kind === "no_customer_contact");
    }
    return true;
  }

  generatePacket(disputeId: string, extraClaims: string[] = []) {
    const dispute = this.disputes.find((d) => d.id === disputeId);
    if (!dispute) throw new Error("missing");
    const rejected = extraClaims.filter((c) => !this.claimAllowed(disputeId, c));
    if (rejected.length) throw new Error(`unsupported_claim:${rejected.join(",")}`);
    const items = this.evidence.filter((e) => e.disputeId === disputeId);
    const checklist = this.checklist(dispute);
    const version = this.packets.filter((p) => p.disputeId === disputeId).length + 1;
    const body = [
      `DisputePacket v${version}`,
      `Shop=${this.shops.find((s) => s.id === dispute.shopId)?.shopDomain}`,
      `Reason=${dispute.reasonCode}`,
      `Amount=${dispute.amountCents} ${dispute.currency}`,
      `Due=${dispute.dueAt}`,
      `RefundWarning=${dispute.status === "open" ? "Do not refund while this dispute is open" : "n/a"}`,
      ...checklist.map((c) => `${c.state === "present" ? "Y" : "N"} ${c.label}`),
      ...items.map((i, idx) => `${idx + 1}. [${i.kind}] ${JSON.stringify(i.facts)} #${i.sha256}`),
      ...extraClaims.map((c) => `CLAIM ${c}`),
    ].join("\n");
    const packet: PacketVersion = {
      id: randomToken(8),
      disputeId,
      version,
      sha256: sha256(body),
      createdAt: new Date().toISOString(),
      body,
    };
    this.packets.push(packet);
    return packet;
  }

  flagRefund(disputeId: string) {
    const dispute = this.disputes.find((d) => d.id === disputeId);
    if (!dispute) return null;
    if (dispute.status === "open") {
      dispute.refundedWhileOpen = true;
      return { warning: "Refunding during an open dispute can produce a double loss." };
    }
    return { warning: null };
  }
}

export const disputePacket = new DisputePacket();
disputePacket.seedDemo();
