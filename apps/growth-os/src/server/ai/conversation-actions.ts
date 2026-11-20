"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@platform/database/server";
import { requireWorkspace } from "@platform/auth";
import { runAction, type ActionResult } from "../action";

export async function deleteConversationAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ws = await requireWorkspace();
    const supabase = await getServerClient();
    // RLS limits deletes to the conversation owner.
    const { error } = await supabase.from("ai_conversations").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", ws.user.id);
    if (error) throw error;
    revalidatePath("/assistant");
    return null;
  }, "Conversation deleted");
}
