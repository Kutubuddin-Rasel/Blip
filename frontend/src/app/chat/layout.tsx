"use client";

import ChatSidebar from "@/components/chat/ChatSidebar";
import { bootstrapSession } from "@/hooks/useAuth";
import { useOnline } from "@/hooks/useOnline";
import { endSession } from "@/lib/session";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const online = useOnline();
  const router = useRouter();
  const exitSavedChats = async () => {
    await endSession(true);
    try { await signOut(auth); } catch { /* Local cache and Blip session were cleared. */ }
    router.replace("/auth/login");
  };
  useEffect(() => { if (status === "unauthenticated") router.replace("/auth/login"); }, [status, router]);
  if (status === "bootstrapping") return <div className="p-6">Restoring session…</div>;
  if (status === "error") return <div role="alert" className="p-6">Could not check your session. <button className="underline" onClick={() => void bootstrapSession()}>Retry</button></div>;
  if (status === "unauthenticated") return <div className="p-6">Sign in to continue…</div>;
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {(status === "cached" || !online) && <div role="status" className="border-b px-4 py-2 text-sm bg-amber-50 text-amber-950">
        {status === "cached" ? "Saved chats only. Your session has not been verified; messaging is unavailable." : "Offline. Saved chats may be incomplete; messaging is unavailable."}
        {status === "cached" && <><button type="button" className="ml-3 underline" onClick={() => void bootstrapSession()}>Check connection</button><button type="button" className="ml-3 underline" onClick={() => void exitSavedChats()}>Exit saved chats</button></>}
      </div>}
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex"><ChatSidebar /></div>
        <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-white dark:bg-black">{children}</main>
      </div>
    </div>
  );
}
