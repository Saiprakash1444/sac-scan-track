import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarPlus, CheckCircle2, PackageOpen } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { ReturnDialog } from "@/components/ReturnDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { extendBorrow, returnComponent } from "@/lib/inventory.functions";
import { borrowLogQuery, daysUntil, formatDate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/my-items")({
  head: () => ({
    meta: [
      { title: "My borrowed items | RMI Inventory" },
      {
        name: "description",
        content:
          "See every component checked out in your name, extend a due date, and mark it returned — flagging damage if needed.",
      },
      { property: "og:title", content: "My borrowed items | RMI Inventory" },
      {
        property: "og:description",
        content: "Your open checkouts, return reminders and extensions for the RMI club room.",
      },
    ],
  }),
  component: MyItemsPage,
});

function ExtendDialog({
  recordId,
  itemLabel,
  dueAt,
  extendedCount,
}: {
  recordId: string;
  itemLabel: string;
  dueAt: string;
  extendedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const queryClient = useQueryClient();
  const doExtend = useServerFn(extendBorrow);

  const mutation = useMutation({
    mutationFn: () => doExtend({ data: { recordId, days } }),
    onSuccess: (res) => {
      toast.success(`Extended — now due ${formatDate(res.dueAt)}`);
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not extend"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1">
          <CalendarPlus className="size-4" />
          Need it longer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend {itemLabel}</DialogTitle>
          <DialogDescription>
            Currently due {formatDate(dueAt)}. You've extended this {extendedCount} of 3 times.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="extend-days">Extra days</Label>
          <Input
            id="extend-days"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Math.min(30, Math.max(1, +e.target.value || 1)))}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Extend due date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyItemsPage() {
  const log = useQuery(borrowLogQuery("mine"));
  const queryClient = useQueryClient();
  const doReturn = useServerFn(returnComponent);

  const mutation = useMutation({
    mutationFn: (input: { recordId: string; damaged: boolean; damageNote?: string }) =>
      doReturn({ data: input }),
    onSuccess: (_res, input) => {
      toast.success(
        input.damaged
          ? "Returned and flagged as damaged — admins have been notified."
          : "Returned — thanks for putting it back.",
      );
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Return failed"),
  });

  const rows = log.data ?? [];
  const open = rows.filter((r) => !r.returned_at);
  const past = rows.filter((r) => r.returned_at).slice(0, 20);
  const overdue = open.filter((r) => daysUntil(r.due_at) < 0);

  return (
    <AppShell title="My items" subtitle="Everything currently logged under your name.">
      {log.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 ? (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="size-4" />
                {overdue.length} item{overdue.length > 1 ? "s" : ""} overdue
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Return them to the club room, or tap “Need it longer” to push the due date.
              </p>
            </div>
          ) : null}

          <section className="space-y-2">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Out with you ({open.length})
            </h2>
            {open.length === 0 ? (
              <div className="panel flex flex-col items-center gap-3 p-6 text-center">
                <PackageOpen className="size-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nothing checked out. Find a part to borrow it.
                </p>
                <Button asChild variant="secondary">
                  <Link to="/find">Browse parts</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {open.map((r) => {
                  const left = daysUntil(r.due_at);
                  const label = `${r.quantity} × ${r.component_name}`;
                  return (
                    <li key={r.id} className="panel p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{label}</p>
                          <p className="mono-tag mt-1 text-muted-foreground">
                            {r.rack_code ?? "—"}
                            {r.bin_label ? ` · bin ${r.bin_label}` : ""}
                          </p>
                        </div>
                        <Badge
                          variant={left < 0 ? "destructive" : left <= 1 ? "outline" : "secondary"}
                        >
                          {left < 0
                            ? `${Math.abs(left)}d overdue`
                            : left === 0
                              ? "Due today"
                              : `Due in ${left}d`}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Taken {formatDate(r.borrowed_at)} · due {formatDate(r.due_at)}
                        {r.extended_count > 0 ? ` · extended ${r.extended_count}×` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ExtendDialog
                          recordId={r.id}
                          itemLabel={label}
                          dueAt={r.due_at}
                          extendedCount={r.extended_count}
                        />
                        <ReturnDialog
                          itemLabel={label}
                          pending={mutation.isPending}
                          onConfirm={({ damaged, damageNote }) =>
                            mutation.mutateAsync({ recordId: r.id, damaged, damageNote })
                          }
                          trigger={
                            <Button variant="secondary" className="flex-1">
                              <CheckCircle2 className="size-4" />
                              Return
                            </Button>
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {past.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Returned
              </h2>
              <ul className="space-y-2">
                {past.map((r) => (
                  <li key={r.id} className="panel p-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {r.quantity} × {r.component_name}
                      </span>
                      {r.damage_reported ? <Badge variant="destructive">Damaged</Badge> : null}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.returned_at!)}
                      </span>
                    </div>
                    {r.damage_note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{r.damage_note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
