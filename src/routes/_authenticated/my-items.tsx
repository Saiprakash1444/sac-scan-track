import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PackageOpen } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { returnComponent } from "@/lib/inventory.functions";
import { borrowLogQuery, daysUntil, formatDate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/my-items")({
  head: () => ({
    meta: [
      { title: "My borrowed items | SAC Inventory" },
      {
        name: "description",
        content:
          "See every component checked out in your name, when it is due back, and mark it returned in one tap.",
      },
      { property: "og:title", content: "My borrowed items | SAC Inventory" },
      {
        property: "og:description",
        content: "Your open checkouts and return reminders for the SAC robotics room.",
      },
    ],
  }),
  component: MyItemsPage,
});

function MyItemsPage() {
  const log = useQuery(borrowLogQuery("mine"));
  const queryClient = useQueryClient();
  const doReturn = useServerFn(returnComponent);

  const mutation = useMutation({
    mutationFn: (recordId: string) => doReturn({ data: { recordId } }),
    onSuccess: () => {
      toast.success("Returned — thanks for putting it back.");
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
              <p className="font-semibold text-destructive">
                {overdue.length} item{overdue.length > 1 ? "s" : ""} overdue
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Please return them to the SAC room or ask an admin to extend the due date.
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
                  Nothing checked out. Scan a part to borrow it.
                </p>
                <Button asChild variant="secondary">
                  <Link to="/scan">Open scanner</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {open.map((r) => {
                  const left = daysUntil(r.due_at);
                  return (
                    <li key={r.id} className="panel p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {r.quantity} × {r.component_name}
                          </p>
                          <p className="mono-tag mt-1 text-muted-foreground">
                            {r.rack_code ?? "—"}
                            {r.bin_label ? ` · bin ${r.bin_label}` : ""}
                          </p>
                        </div>
                        <Badge variant={left < 0 ? "destructive" : left <= 1 ? "outline" : "secondary"}>
                          {left < 0
                            ? `${Math.abs(left)}d overdue`
                            : left === 0
                              ? "Due today"
                              : `Due in ${left}d`}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Taken {formatDate(r.borrowed_at)} · due {formatDate(r.due_at)}
                      </p>
                      <Button
                        className="mt-3 w-full"
                        variant="secondary"
                        onClick={() => mutation.mutate(r.id)}
                        disabled={mutation.isPending}
                      >
                        {mutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Mark returned
                      </Button>
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
                  <li key={r.id} className="panel flex items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {r.quantity} × {r.component_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(r.returned_at!)}
                    </span>
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
