"use client";

import { requireAuth } from "@/lib/firebase";
import type { Conversation, Message } from "@/types";

async function apiChat(path: string, init?: RequestInit) {
  const user = requireAuth().currentUser;
  if (!user) throw new Error("Please sign in to use chat.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to use chat.");
  return payload;
}

export function subscribeConversation(conversationId: string, callback: (conversation: Conversation | null) => void, onError?: (error: Error) => void) {
  let stopped = false;
  const load = () => apiChat("/api/chat")
    .then(payload => {
      const conversations = Array.isArray(payload.conversations) ? payload.conversations as Conversation[] : [];
      if (!stopped) callback(conversations.find(item => item.id === conversationId) ?? null);
    })
    .catch(error => !stopped && onError?.(error));
  void load();
  const interval = window.setInterval(load, 5000);
  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}

export function subscribeUserConversations(userId: string, callback: (conversations: Conversation[]) => void, onError?: (error: Error) => void) {
  void userId;
  let stopped = false;
  const load = () => apiChat("/api/chat")
    .then(payload => !stopped && callback(Array.isArray(payload.conversations) ? payload.conversations as Conversation[] : []))
    .catch(error => !stopped && onError?.(error));
  void load();
  const interval = window.setInterval(load, 5000);
  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}

export function subscribeMessages(conversationId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) {
  let stopped = false;
  const load = () => apiChat(`/api/chat?conversationId=${encodeURIComponent(conversationId)}`)
    .then(payload => !stopped && callback(Array.isArray(payload.messages) ? payload.messages as Message[] : []))
    .catch(error => !stopped && onError?.(error));
  void load();
  const interval = window.setInterval(load, 3000);
  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}

export async function sendMessage(conversation: Conversation, senderId: string, body: string) {
  void senderId;
  await apiChat("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: conversation.id, body })
  });
}

export async function sendImage() {
  throw new Error("Image chat will be available after file messaging is connected.");
}

export function setTyping() {
  return Promise.resolve();
}

export function markRead() {
  return Promise.resolve();
}
