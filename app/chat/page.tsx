"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { sendMessage } from "@/services/chat";
import type { Conversation } from "@/types";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";

const demoConversation: Conversation = {
  id: "job-cleaning-westlands_worker-ama",
  jobId: "job-cleaning-westlands",
  clientId: "client-1",
  workerId: "worker-ama",
  locked: false,
  participants: ["client-1", "worker-ama"],
  lastMessage: "I can arrive by 8am.",
  updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0, toDate: () => new Date() } as never
};

export default function ChatPage() {
  const { profile, loading, isAuthorized } = useProtectedRoute();
  const lockedPreview = !profile || !demoConversation.participants.includes(profile.id);
  if (loading || !isAuthorized) return <LoadingSpinner label="Opening chat" />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <h1 className="text-3xl font-black">Chat</h1>
        <p className="mt-2 text-sm text-smoky/70">Messages use Firestore subcollections, typing flags, read receipts, images, and FCM pushes.</p>
      </Card>
      <div className="glass rounded-2xl p-4">
        {lockedPreview ? (
          <div className="flex items-center gap-3 rounded-2xl bg-bone/10 p-4"><Lock />Chat unlocks after an accepted application or invitation.</div>
        ) : (
          <>
            <div className="space-y-3">
              <p className="max-w-[80%] rounded-2xl bg-bone p-3 text-sm text-smoky">I can arrive by 8am.</p>
              <p className="ml-auto max-w-[80%] rounded-2xl bg-olive p-3 text-sm">Great, please bring your certificate.</p>
            </div>
            <form className="mt-4 flex gap-2" onSubmit={event => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("body") as HTMLInputElement;
              sendMessage(demoConversation, profile!.id, input.value).then(() => toast.success("Message sent")).catch(error => toast.error(error.message));
              input.value = "";
            }}>
              <input name="body" className="min-w-0 flex-1 rounded-2xl bg-smoky px-4 py-3 outline-none" placeholder="Message" />
              <Button><Send size={18} /></Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
