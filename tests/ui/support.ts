import type { Faq, SupportMessage, SupportTicket } from "@/services/support";

// Read-only subscriptions for the isolated visual review server.
export function subscribeFaqs(callback: (items: Faq[]) => void) {
  callback([{ id: "fixture-faq", question: "How do catalogue bookings work?", answer: "Browse a service, choose optional extras, review the proposed total and send your request to the worker.", published: true }]);
  return () => {};
}
export function subscribeSupportTickets(_userId: string, callback: (items: SupportTicket[]) => void) { callback([]); return () => {}; }
export function subscribeTicketMessages(_ticketId: string, callback: (items: SupportMessage[]) => void) { callback([]); return () => {}; }
export async function createSupportTicket() { throw new Error("This visual fixture cannot create a support ticket."); }
export async function sendSupportMessage() { throw new Error("This visual fixture cannot send a message."); }
