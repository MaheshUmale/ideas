/** Integer cents + basis points — never floats. */
export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

export function changeOrderTotal(
  subtotalCents: number,
  markupBps: number,
  taxBps: number,
): number {
  const marked = subtotalCents + applyBps(subtotalCents, markupBps);
  return marked + applyBps(marked, taxBps);
}

export function changeBps(previous: number, current: number): number {
  if (previous <= 0) throw new Error("previous price must be positive");
  return Math.round(((current - previous) * 10_000) / previous);
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}
