import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Boxes, PackageCheck, Users } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { returnComponent } from "@/lib/inventory.functions";
import {
  borrowLogQuery,
  daysUntil,
  formatDate,
  inventoryQuery,
  meQuery,
  purposeLabel,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Room dashboard | RMI Inventory" },
      {
        name: "description",
        content:
          "Room panel for admins: live stock levels, who has borrowed what, and overdue component alerts.",
      },
      { property: "og:title", content: "Room dashboard | RMI Inventory" },
      {
        property: "og:description",
        content: "Live stock, active checkouts and overdue alerts for the RMI club room.",
      },
    ],
  }),
  component: DashboardPage,
});

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Boxes;
  tone?: "warn";
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`size-4 ${tone === "warn" ? "text-destructive" : "text-primary"}`} />
        <span className="mono-tag">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function DashboardPage() {
  const me = useQuery(meQuery());
  const inventory = useQuery(inventoryQuery());
  const log = useQuery(borrowLogQuery("all"));
  const queryClient = useQueryClient();
  const doReturn = useServerFn(returnComponent);

  const mutation = useMutation({
    mutationFn: (recordId: string) => doReturn({ data: { recordId } }),
    onSuccess: () => {
      toast.success("Marked returned");
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Return failed"),
  });

  if (me.isSuccess && !me.data.isAdmin) {
    return (
      <AppShell title="Dashboard">
        <div className="panel p-6 text-sm text-muted-foreground">
          The room dashboard is limited to club admins. Ask an admin to grant you access.
        </div>
      </AppShell>
    );
  }

  const components = inventory.data?.components ?? [];
  const racks = inventory.data?.racks ?? [];
  const rows = log.data ?? [];
  const open = rows.filter((r) => !r.returned_at);
  const overdue = open.filter((r) => daysUntil(r.due_at) < 0);
  const lowStock = components.filter(
    (c) =>
      c.borrowable &&
      c.category !== "mech" &&
      c.quantity_available <= Math.max(1, Math.floor(c.quantity_total * 0.25)),
  );

  const borrowers = new Set(open.map((r) => r.user_id)).size;

  return (
    <AppShell title="Room dashboard" subtitle="Live view of the RMI component store.">
      {log.isLoading || inventory.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Part types" value={components.length} icon={Boxes} />
            <Stat label="Out now" value={open.length} icon={PackageCheck} />
            <Stat label="Members holding" value={borrowers} icon={Users} />
            <Stat label="Overdue" value={overdue.length} icon={AlertTriangle} tone="warn" />
          </div>

          {overdue.length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-destructive">
                Overdue alerts
              </h2>
              <ul className="space-y-2">
                {overdue.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-destructive/50 bg-destructive/10 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {r.member_name} · {r.quantity} × {r.component_name}
                      </p>
                      <Badge variant="destructive">{Math.abs(daysUntil(r.due_at))}d late</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Due {formatDate(r.due_at)} · {r.rack_code ?? "—"}
                    </p>
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="secondary"
                      onClick={() => mutation.mutate(r.id)}
                      disabled={mutation.isPending}
                    >
                      Mark returned
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Currently borrowed
            </h2>
            {open.length === 0 ? (
              <p className="panel p-4 text-sm text-muted-foreground">
                Everything is on the racks right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {open.map((r) => (
                  <li key={r.id} className="panel flex flex-wrap items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {r.quantity} × {r.component_name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {r.member_name} · taken {formatDate(r.borrowed_at)} · {purposeLabel(r)}
                      </span>
                    </span>
                    <Badge variant={daysUntil(r.due_at) <= 1 ? "outline" : "secondary"}>
                      due {formatDate(r.due_at)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => mutation.mutate(r.id)}
                      disabled={mutation.isPending}
                    >
                      Returned
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Running low
            </h2>
            {lowStock.length === 0 ? (
              <p className="panel p-4 text-sm text-muted-foreground">Stock levels look healthy.</p>
            ) : (
              <ul className="space-y-2">
                {lowStock.map((c) => (
                  <li key={c.id} className="panel flex items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="mono-tag text-muted-foreground">
                        {racks.find((r) => r.id === c.rack_id)?.code ?? "—"}
                        {c.bin_label ? ` · bin ${c.bin_label}` : ""}
                      </span>
                    </span>
                    <Badge variant="outline" className="text-warning">
                      {c.quantity_available}/{c.quantity_total} left
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
