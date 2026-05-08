import { Card } from "@/components/ui/Card";

export default function OfflinePage() {
  return <Card className="mx-auto max-w-md text-center"><h1 className="text-3xl font-black">You are offline</h1><p className="mt-3 text-sm text-smoky/70">Temp cached this fallback page. Reconnect to sync jobs, chat, wallet, and KYC updates.</p></Card>;
}
