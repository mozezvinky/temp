"use client";

import { db, storage } from "@/lib/firebase";
import type { Conversation, Message } from "@/types";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

export function subscribeConversation(conversationId: string, callback: (conversation: Conversation | null) => void) {
  return onSnapshot(doc(db, "messages", conversationId), snap => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Conversation) : null));
}

export function subscribeMessages(conversationId: string, callback: (messages: Message[]) => void) {
  return onSnapshot(query(collection(db, "messages", conversationId, "items"), orderBy("createdAt", "asc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Message));
  });
}

export async function sendMessage(conversation: Conversation, senderId: string, body: string) {
  if (conversation.locked || !conversation.participants.includes(senderId)) throw new Error("Chat unlocks after a hire or accepted invitation.");
  await addDoc(collection(db, "messages", conversation.id, "items"), {
    conversationId: conversation.id,
    senderId,
    body,
    readBy: [senderId],
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "messages", conversation.id), { lastMessage: body, updatedAt: serverTimestamp() });
}

export async function sendImage(conversation: Conversation, senderId: string, file: File) {
  if (conversation.locked || !conversation.participants.includes(senderId)) throw new Error("Chat is locked.");
  const uploaded = await uploadBytes(ref(storage, `messages/${conversation.id}/${crypto.randomUUID()}-${file.name}`), file);
  const imageUrl = await getDownloadURL(uploaded.ref);
  await addDoc(collection(db, "messages", conversation.id, "items"), {
    conversationId: conversation.id,
    senderId,
    imageUrl,
    readBy: [senderId],
    createdAt: serverTimestamp()
  });
}

export function setTyping(conversationId: string, userId: string, isTyping: boolean) {
  return updateDoc(doc(db, "messages", conversationId, "typing", userId), { isTyping, updatedAt: serverTimestamp() });
}

export function markRead(conversationId: string, messageId: string, userId: string, readBy: string[]) {
  return updateDoc(doc(db, "messages", conversationId, "items", messageId), { readBy: Array.from(new Set([...readBy, userId])) });
}
