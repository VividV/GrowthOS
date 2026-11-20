import Link from "next/link";
import { CalendarCheck, Lightbulb, ListTodo, Plus } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger,
  cn, formatMoney, relativeDays,
} from "@platform/ui";
import { requirePermission } from "@platform/auth";
import { getServerClient } from "@platform/database/server";
import { toAppError, type FollowUpTask } from "@platform/database";
import { todayIn } from "@/lib/dates";
import { getSuggestions, optional } from "@/server/queries";
import { PriorityBadge } from "@/components/status";
import { TaskDialog } from "./task-form";
import { TaskRowActions } from "./task-row-actions";

export const metadata = { title: "Follow-ups" };

type TaskRow = FollowUpTask & { customers: { id: string; full_name: string; phone: string | null } | null; orders: { order_number: string } | null };

export default async function Tasks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ws = await requirePermission("tasks.read");
  const org = ws.organization.id;
  const today = todayIn(ws.organization.timezone);
  const supabase = await getServerClient();
  const mine = sp.view === "mine";

  let q = supabase.from("follow_up_tasks").select("*, customers(id, full_name, phone), orders(order_number)").eq("organization_id", org);
  if (mine) q = q.eq("assigned_to", ws.user.id);
  const [{ data, error }, membersRes, customersRes, suggestions] = await Promise.all([
    q.order("due_date").limit(300),
    supabase.from("organization_members").select("user_id, profiles(full_name)").eq("organization_id", org).eq("status", "active"),
    supabase.from("customers").select("id, full_name").eq("organization_id", org).is("archived_at", null).order("full_name").limit(500),
    ws.can("orders.read") ? optional(getSuggestions(org)) : null,
  ]);
  if (error) throw toAppError(error);
  const tasks = (data ?? []) as TaskRow[];
  const members = ((membersRes.data ?? []) as unknown as { user_id: string; profiles: { full_name: string } | null }[]).map((m) => ({ id: m.user_id, name: m.profiles?.full_name || "Team member" }));
  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const customers = (customersRes.data ?? []) as { id: string; full_name: string }[];

  const open = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const overdue = open.filter((t) => t.due_date < today);
  const dueToday = open.filter((t) => t.due_date === today);
  const upcoming = open.filter((t) => t.due_date > today);
  const done = tasks.filter((t) => t.status === "completed" || t.status === "cancelled").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 50);
  const canWrite = ws.can("tasks.write") && ws.writable;
  const dialogProps = { members, customers, currentUserId: ws.user.id, canAssign: ws.can("tasks.assign") };

  const list = (items: TaskRow[], empty: string) =>
    items.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p> : (
      <ul className="divide-y">
        {items.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("text-sm font-medium", t.status === "completed" && "text-muted-foreground line-through")}>{t.title}</span>
                <PriorityBadge priority={t.priority} />
                {t.status === "in_progress" && <Badge tone="info">In progress</Badge>}
                {t.source === "suggested" && <Badge tone="primary">Suggested</Badge>}
              </div>
              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className={cn(t.due_date < today && open.includes(t) && "font-medium text-danger")}>{relativeDays(t.due_date, today)}</span>
                {t.customers && <Link href={`/customers/${t.customers.id}`} className="text-primary">{t.customers.full_name}</Link>}
                {t.orders && t.order_id && <Link href={`/orders/${t.order_id}`} className="text-primary">{t.orders.order_number}</Link>}
                {t.assigned_to && <span>→ {memberName[t.assigned_to] ?? "Former member"}</span>}
              </p>
              {t.completion_notes && <p className="text-xs italic text-muted-foreground">“{t.completion_notes}”</p>}
            </div>
            {canWrite && <TaskRowActions id={t.id} status={t.status} canDelete={ws.can("tasks.assign")} />}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Follow-ups"
        description="Your daily list of people to call, chase and thank."
        actions={
          <>
            <div className="inline-flex rounded-lg border bg-background p-0.5 text-sm">
              <Link href="/tasks" className={cn("rounded-md px-3 py-1", !mine && "bg-primary-soft font-medium text-primary")}>All</Link>
              <Link href="/tasks?view=mine" className={cn("rounded-md px-3 py-1", mine && "bg-primary-soft font-medium text-primary")}>Mine</Link>
            </div>
            {canWrite && <TaskDialog {...dialogProps} defaultOpen={sp.new === "1"} />}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className={cn("text-2xl font-semibold tabular", overdue.length && "text-danger")}>{overdue.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Due today</p><p className="text-2xl font-semibold tabular">{dueToday.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Upcoming</p><p className="text-2xl font-semibold tabular">{upcoming.length}</p></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <Tabs defaultValue="today">
            <div className="border-b px-4 py-3 sm:px-5">
              <TabsList>
                <TabsTrigger value="today">Today ({overdue.length + dueToday.length})</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
                <TabsTrigger value="done">Done</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="today">
              {overdue.length + dueToday.length === 0 ? (
                <EmptyState icon={CalendarCheck} title="You're all caught up" description="Nothing due today. Check the suggestions for customers worth contacting." />
              ) : (
                <>
                  {overdue.length > 0 && <p className="bg-danger-soft/50 px-5 py-1.5 text-xs font-medium text-danger">Overdue</p>}
                  {list(overdue, "")}
                  {dueToday.length > 0 && <p className="bg-subtle px-5 py-1.5 text-xs font-medium text-muted-foreground">Due today</p>}
                  {list(dueToday, "")}
                </>
              )}
            </TabsContent>
            <TabsContent value="upcoming">{list(upcoming, "No upcoming follow-ups.")}</TabsContent>
            <TabsContent value="done">{list(done, "Nothing completed yet.")}</TabsContent>
          </Tabs>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /><CardTitle>Suggested follow-ups</CardTitle></div>
            <CardDescription>Generated from balances, stale enquiries, late orders and buying patterns.</CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {!suggestions || suggestions.length === 0 ? (
              <EmptyState icon={ListTodo} title="No suggestions right now" className="py-6" />
            ) : (
              <ul className="space-y-3">
                {suggestions.slice(0, 12).map((s) => (
                  <li key={s.suggestion_key} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{s.title}</p>
                      <PriorityBadge priority={s.priority} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.reason}{s.amount ? ` · ${formatMoney(s.amount, ws.organization.currency)}` : ""}</p>
                    {canWrite && (
                      <div className="mt-2">
                        <TaskDialog {...dialogProps} title="Add suggested follow-up"
                          task={{ title: s.title, description: s.reason, customer_id: s.customer_id, order_id: s.order_id, priority: s.priority, due_date: today, suggestion_key: s.suggestion_key }}
                          trigger={<Button size="sm" variant="outline"><Plus /> Add to my list</Button>} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
