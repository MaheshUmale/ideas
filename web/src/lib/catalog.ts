export type ProductSlug =
  | "outcome-watch"
  | "change-order-lite"
  | "fixproof"
  | "plate-delta"
  | "dispute-packet"
  | "ledger-exit"
  | "report-narrator"
  | "billable-recall";

export type ProductCard = {
  slug: ProductSlug;
  name: string;
  rank: number;
  tagline: string;
  buyer: string;
  features: [string, string, string];
  cut: string;
  href: string;
  accent: string;
};

export const PRODUCTS: ProductCard[] = [
  {
    slug: "report-narrator",
    name: "ReportNarrator",
    rank: 1,
    tagline: "Governed client-report drafts from a locked spreadsheet.",
    buyer: "Boutique PPC/SEO agencies",
    features: [
      "Map named ranges to locked slide placeholders",
      "Deterministic commentary with cell citations",
      "Approval checklist and PDF-ready export",
    ],
    cut: "No ad-platform connectors or LLM free-writing",
    href: "/report-narrator",
    accent: "#6b4f2a",
  },
  {
    slug: "outcome-watch",
    name: "OutcomeWatch",
    rank: 2,
    tagline: "Prove source events reached their destination.",
    buyer: "No-code automation agencies",
    features: [
      "Universal source/destination webhook",
      "SLA, cadence, and required-field incidents",
      "Agency dashboard + client status link",
    ],
    cut: "No native Zapier APIs or auto-remediation",
    href: "/outcome-watch",
    accent: "#0f766e",
  },
  {
    slug: "change-order-lite",
    name: "ChangeOrder Lite",
    rank: 3,
    tagline: "Field evidence to a signed approval packet.",
    buyer: "Specialty subcontractors",
    features: [
      "Priced change-order with photos and numbering",
      "No-login approve/reject link",
      "Frozen PDF packet and project register CSV",
    ],
    cut: "Not a construction PM suite or qualified e-sign",
    href: "/change-order-lite",
    accent: "#c2410c",
  },
  {
    slug: "fixproof",
    name: "FixProof",
    rank: 4,
    tagline: "Never confuse a closed ticket with a finished repair.",
    buyer: "Property managers, 50–500 units",
    features: [
      "Assign vendors with an expiring no-login link",
      "Required before/after proof",
      "Tenant updates and manager verification",
    ],
    cut: "No rent, leases, or PMS write-back",
    href: "/fixproof",
    accent: "#0369a1",
  },
  {
    slug: "plate-delta",
    name: "PlateDelta",
    rank: 5,
    tagline: "Which ingredients just got materially more expensive?",
    buyer: "Independent restaurants",
    features: [
      "Invoice line extraction inbox",
      "Human review and pack-size normalization",
      "Threshold alerts and verified CSV",
    ],
    cut: "Not inventory, POS, or zero-touch AP",
    href: "/plate-delta",
    accent: "#b45309",
  },
  {
    slug: "billable-recall",
    name: "BillableRecall",
    rank: 6,
    tagline: "Private timeline that suggests — never submits — time.",
    buyer: "Fractional consultants",
    features: [
      "Allow-listed domain intervals, idle excluded",
      "Calendar import and local grouping",
      "Approved CSV export and retainer warnings",
    ],
    cut: "No screenshots, keylogging, or cloud sync",
    href: "/billable-recall",
    accent: "#6d28d9",
  },
  {
    slug: "dispute-packet",
    name: "DisputePacket",
    rank: 7,
    tagline: "Reason-code evidence before the chargeback deadline.",
    buyer: "High-AOV Shopify merchants",
    features: [
      "Order/fulfillment evidence timeline",
      "Reason-code checklist and missing flags",
      "Versioned indexed packet + refund warning",
    ],
    cut: "No win guarantee or auto-submission",
    href: "/dispute-packet",
    accent: "#1e3a5f",
  },
  {
    slug: "ledger-exit",
    name: "LedgerExit",
    rank: 8,
    tagline: "Find missing, duplicated, and unbalanced books first.",
    buyer: "Bookkeepers migrating QuickBooks → Xero",
    features: [
      "Prescribed CSV bundle ingest",
      "Deterministic TB / AR / AP / duplicate checks",
      "Exception report with checksums",
    ],
    cut: "Verification only — never conversion",
    href: "/ledger-exit",
    accent: "#14532d",
  },
];
