"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlarmClock, Check, MoreHorizontal, PlayCircle, RotateCcw, Trash2, XCircle } from "lucide-react";
import {
  Button, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, Textarea, toast,
} from "@platform/ui";
import { completeTaskAction, deleteTaskAction, setTaskStatusAction, snoozeTaskAction } from "@/server/task-actions";

export function TaskRowActions({ id, status, canDelete }: { id: string; status: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.message ?? "Updated"); router.refresh(); } else toast.error(r.error ?? "Failed");
    });
  const done = status === "completed" || status === "cancelled";

  return (
    <div className="flex items-center gap-1">
      {!done && (
        <Button size="sm" variant="outline" onClick={() => setCompleting(true)} disabled={pending} aria-label="Mark complete">
          <Check /> <span className="hidden sm:inline">Done</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More actions" disabled={pending}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          {!done && (
            <>
              <DropdownMenuLabel>Snooze</DropdownMenuLabel>
              {[1, 3, 7].map((d) => <DropdownMenuItem key={d} onSelect={() => run(() => snoozeTaskAction(id, d))}><AlarmClock /> {d === 1 ? "Tomorrow" : `${d} days`}</DropdownMenuItem>)}
              <DropdownMenuSeparator />
              {status === "open" && <DropdownMenuItem onSelect={() => run(() => setTaskStatusAction(id, "in_progress"))}><PlayCircle /> Start</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => run(() => setTaskStatusAction(id, "cancelled"))}><XCircle /> Cancel</DropdownMenuItem>
            </>
          )}
          {done && <DropdownMenuItem onSelect={() => run(() => setTaskStatusAction(id, "open"))}><RotateCcw /> Reopen</DropdownMenuItem>}
          {canDelete && <DropdownMenuItem destructive onSelect={() => run(() => deleteTaskAction(id))}><Trash2 /> Delete</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={completing} onOpenChange={setCompleting}>
        <DialogContent title="Complete follow-up" size="sm">
          <label className="text-sm font-medium" htmlFor={`notes-${id}`}>Outcome (optional)</label>
          <Textarea id={`notes-${id}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Customer will pay on Friday" className="mt-1.5" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCompleting(false)}>Cancel</Button>
            <Button loading={pending} onClick={() => run(async () => { const r = await completeTaskAction(id, notes); if (r.ok) setCompleting(false); return r; })}>Mark complete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
