export const GST_RATE = 0.05;

export function priceBreakdown(fares: number[]) {
  const base = fares.reduce((a, b) => a + b, 0);
  const gst = Math.round(base * GST_RATE);
  return { base, gst, total: base + gst };
}

/** Standard cancellation: ticket - fee, never negative. e.g. 1000 - 50 = 950. */
export function refundBreakdown(ticketAmount: number, fee: number) {
  const deduction = Math.min(Math.max(fee, 0), ticketAmount);
  return { ticketAmount, deduction, refund: ticketAmount - deduction };
}

/** Fallback "standard terms": refund a configured percentage of the ticket (no extra fee). */
export function standardTermsRefund(ticketAmount: number, percent: number) {
  const refund = Math.round((ticketAmount * Math.min(Math.max(percent, 0), 100)) / 100);
  return { ticketAmount, deduction: ticketAmount - refund, refund };
}
