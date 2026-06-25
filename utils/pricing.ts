export function workerVisiblePay(clientBudget: number) {
  return Math.max(0, Math.round(clientBudget * 0.9));
}
