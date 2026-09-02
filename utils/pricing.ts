import { calculateClientPostedJobPaymentBreakdown } from "@/utils/money";

export function workerVisiblePay(clientBudget: number) {
  return calculateClientPostedJobPaymentBreakdown(clientBudget).workerEarnings;
}
