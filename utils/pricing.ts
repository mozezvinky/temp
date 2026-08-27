import { calculateJobPaymentBreakdown } from "@/utils/money";

export function workerVisiblePay(clientBudget: number) {
  return calculateJobPaymentBreakdown(clientBudget).workerEarnings;
}
