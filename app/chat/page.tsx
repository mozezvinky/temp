"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { sendImage, sendMessage, subscribeMessages, subscribeUserConversations } from "@/services/chat";
import type { Conversation, Message } from "@/types";
import { ImagePlus, Lock, Send } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function ChatPage() {
  const { profile, loading: authLoading, isAuthorized } = useProtectedRoute();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingImage, setSendingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!profile) return;
    return subscribeUserConversations(profile.id, items => {
      const available = items.filter(item => !item.locked);
      setConversations(available);
      setSelectedId(current => available.some(item => item.id === current) ? current : available[0]?.id || "");
      setLoading(false);
    }, () => setLoading(false));
  }, [profile]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    return subscribeMessages(selectedId, setMessages, () => setMessages([]));
  }, [selectedId]);

  const conversation = conversations.find(item => item.id === selectedId) ?? null;
  const otherName = conversation
    ? profile?.role === "worker"
      ? conversation.clientName ?? "Client"
      : conversation.workerName ?? "Worker"
    : "Conversation";

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !conversation) return;
    const input = event.currentTarget.elements.namedItem("body") as HTMLInputElement;
    const body = input.value.trim();
    if (!body) return;
    try {
      await sendMessage(conversation, profile.id, body);
      input.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message.");
    }
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    if (!profile || !conversation) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSendingImage(true);
    try {
      await sendImage(conversation, profile.id, file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send image.");
    } finally {
      setSendingImage(false);
    }
  }

  if (authLoading || !isAuthorized || !profile) return <LoadingSpinner label="Opening chat" />;
  if (loading) return <LoadingSpinner label="Opening chat" />;
  if (!conversations.length) return <EmptyState title="No conversations yet" body="Chat becomes available after a job arrangement is accepted." />;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-[.38fr_.62fr]">
      <Card>
        <h1 className="text-2xl font-black text-[#FFFBFF]">Chat</h1>
        <div className="mt-4 grid gap-2">
          {conversations.map(item => (
            <button key={item.id} onClick={() => setSelectedId(item.id)} className={`rounded-xl p-3 text-left text-sm ${selectedId === item.id ? "bg-bone text-[#1E1B13]" : "bg-[#2A2A2B] text-[#CCC6BB]"}`}>
              <p className="font-bold">{profile.role === "worker" ? item.clientName ?? "Client" : item.workerName ?? "Worker"}</p>
              <p className="mt-1 truncate">{item.lastMessage ?? "No messages yet"}</p>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        {!conversation ? (
          <div className="flex items-center gap-3 rounded-xl bg-[#2A2A2B] p-4"><Lock />Choose a conversation.</div>
        ) : (
          <div>
            <div className="mb-4 border-b border-[#4A463F] pb-4">
              <p className="text-sm font-bold uppercase tracking-[.18em] text-[#959087]">Chat with</p>
              <h2 className="mt-1 text-2xl font-black text-[#FFFBFF]">{otherName}</h2>
              {conversation.locked && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#4A463F] bg-[#2A2A2B] p-3 text-sm font-bold text-[#CCC6BB]">
                  <Lock size={16} /> This chat is locked because the job is completed.
                </div>
              )}
            </div>
            <div className="min-h-64 space-y-3">
              {messages.length ? messages.map(message => (
                <div key={message.id} className={`max-w-[80%] rounded-xl p-3 text-sm ${message.senderId === profile?.id ? "ml-auto bg-bone text-[#1E1B13]" : "bg-[#2A2A2B] text-[#CCC6BB]"}`}>
                  {message.imageUrl && <img src={message.imageUrl} alt="Chat upload" className="max-h-72 w-full rounded-lg object-cover" />}
                  {message.body && <p className={message.imageUrl ? "mt-2" : ""}>{message.body}</p>}
                  {!message.body && !message.imageUrl && <p>Message</p>}
                </div>
              )) : <p className="text-sm text-[#959087]">No messages yet.</p>}
            </div>
            {!conversation.locked && (
              <form className="mt-4 flex gap-2" onSubmit={send}>
                <input name="body" required className="temp-input min-w-0 flex-1 rounded-xl px-4 py-3 outline-none" placeholder="Message" />
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={chooseImage} />
                <Button type="button" variant="secondary" disabled={sendingImage} onClick={() => imageInputRef.current?.click()}><ImagePlus size={18} /></Button>
                <Button type="submit"><Send size={18} /></Button>
              </form>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
