"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "@platform/ui";
import { deleteConversationAction } from "@/server/ai/conversation-actions";

export function DeleteConversation({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button aria-label="Delete conversation" disabled={pending} className="rounded p-1 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
      onClick={() => start(async () => {
        const r = await deleteConversationAction(id);
        if (r.ok) { router.push("/assistant"); router.refresh(); } else toast.error(r.error);
      })}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
