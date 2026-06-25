"use client";

import { requireDb } from "@/lib/firebase";
import type { Role } from "@/types";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch, where } from "firebase/firestore";

export type TicketStatus = "open" | "pending" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  status: TicketStatus;
  lastMessage: string;
  unreadForUser: boolean;
  unreadForAdmin: boolean;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: Role;
  body: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  published: boolean;
}

export function subscribeSupportTickets(userId: string, callback: (tickets: SupportTicket[]) => void) {
  return onSnapshot(
    query(collection(requireDb(), "supportTickets"), where("userId", "==", userId), orderBy("updatedAt", "desc"), limit(20)),
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as SupportTicket)),
    () => callback([])
  );
}

export function subscribeAllSupportTickets(callback: (tickets: SupportTicket[]) => void) {
  return onSnapshot(
    query(collection(requireDb(), "supportTickets"), orderBy("updatedAt", "desc"), limit(50)),
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as SupportTicket)),
    () => callback([])
  );
}

export function subscribeTicketMessages(ticketId: string, callback: (items: SupportMessage[]) => void) {
  return onSnapshot(
    query(collection(requireDb(), "supportTickets", ticketId, "messages"), orderBy("createdAt", "asc")),
    snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as SupportMessage)),
    () => callback([])
  );
}

export async function createSupportTicket(userId: string, userName: string, role: Exclude<Role, "admin">, subject: string, details: string) {
  const db = requireDb();
  const ticketRef = doc(collection(db, "supportTickets"));
  const messageRef = doc(collection(db, "supportTickets", ticketRef.id, "messages"));
  const batch = writeBatch(db);
  batch.set(ticketRef, {
    id: ticketRef.id,
    userId,
    userName,
    subject,
    status: "open",
    lastMessage: details,
    unreadForUser: false,
    unreadForAdmin: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(messageRef, {
    id: messageRef.id,
    ticketId: ticketRef.id,
    senderId: userId,
    senderRole: role,
    body: details,
    createdAt: serverTimestamp()
  });
  await batch.commit();
  return ticketRef.id;
}

export async function sendSupportMessage(ticket: SupportTicket, senderId: string, senderRole: Role, body: string) {
  const db = requireDb();
  const ticketRef = doc(db, "supportTickets", ticket.id);
  const messageRef = doc(collection(db, "supportTickets", ticket.id, "messages"));
  const batch = writeBatch(db);
  batch.set(messageRef, { id: messageRef.id, ticketId: ticket.id, senderId, senderRole, body, createdAt: serverTimestamp() });
  batch.update(ticketRef, {
    lastMessage: body,
    unreadForUser: senderRole === "admin",
    unreadForAdmin: senderRole !== "admin",
    status: senderRole === "admin" ? "pending" : ticket.status === "resolved" ? "open" : ticket.status,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus) {
  const db = requireDb();
  const batch = writeBatch(db);
  batch.update(doc(db, "supportTickets", ticketId), { status, updatedAt: serverTimestamp() });
  await batch.commit();
}

export function subscribeFaqs(callback: (items: Faq[]) => void) {
  return onSnapshot(
    query(collection(requireDb(), "faqs"), where("published", "==", true), limit(100)),
    snapshot => callback(snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }) as Faq)
      .sort((a, b) => a.question.localeCompare(b.question))),
    () => callback([])
  );
}

export async function publishFaq(question: string, answer: string) {
  const faqRef = doc(collection(requireDb(), "faqs"));
  await setDoc(faqRef, {
    id: faqRef.id,
    question,
    answer,
    published: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
