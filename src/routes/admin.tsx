import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  Boxes,
  Loader2,
  Lock,
  LockOpen,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ReturnDialog } from "@/components/ReturnDialog";
import {
  adminReturnLoan,
  adminSendReminders,
  getAdminOverview,
  lockAdmin,
  unlockAdmin,
} from "@/lib/admin.functions";
import { daysUntil, formatDate } from "@/lib/queries";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "SAC admin panel | SAC Inventory" },
      {
        name: "description",
        content:
          "Single-credential room panel: see who took which component, what is due back, and damage reports from returns.",
      },
      { property: "og:title", content: "SAC admin panel | SAC Inventory" },
      {
        property: "og:description",
        content: "Monitor SAC robotics room checkouts, due dates and damaged parts in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const overviewKey = ["admin-overview"] as const;

function UnlockCard() {
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const doUnlock = useServerFn(unlockAdmin);

  const mutation = useMutation({
    mutationFn: () => doUnlock({ data: { password } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: overviewKey });
      } else {
        toast.error("Wrong password");
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not unlock"),
  });

  return (
    <div className="mx-auto max-w-sm">
      <div className="panel p-6">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-signal">
          <ShieldCheck className="size-5 text-primary-foreground" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold">SAC admin panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One shared credential for the room computer. Enter the admin password to monitor
          checkouts, due dates and damage reports.
        </p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Admin password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending || !password}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}
            Unlock panel
          </Button>
        </form>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground underline">
          Back to member app
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Boxes; tone?: "warn" }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={tone === "warn" ? "size-4 text-destructive" : "size-4 text-primary"} />
        <span className="mono-tag">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const doLock = useServerFn(lockAdmin);
  const doReturn = useServerFn(adminReturnLoan);
  const doRemind = useServerFn(adminSendReminders);
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: overviewKey,
    queryFn: () => fetchOverview({}),
    refetchInterval: 60_000,
  });

  const lock = useMutation({
    mutationFn: () => doLock({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: overviewKey }),
  });

  const returnLoan = useMutation({
    mutationFn: (input: { recordId: string; damaged: boolean; damageNote?: string }) =>
      doReturn({ data: input }),
    onSuccess: () => {
      toast.success("Logged as returned");
      queryClient.invalidateQueries({ queryKey: overviewKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed"),
  });

  const remind = useMutation({
    mutationFn: () => doRemind({}),
    onSuccess: (res) => toast.success(`${res.sent} reminder${res.sent === 1 ? "" : "s"} sent`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed"),
  });

  if (overview.isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!overview.data || overview.data.locked) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10">
        <div className="w-full">
          <UnlockCard />
        </div>
      </main>
    );
  }

  const data = overview.data;
  const open = data.loans.filter((l) => !l.returned_at);
  const overdue = open.filter((l) => daysUntil(l.due_at) < 0);
  const damaged = data.loans.filter((l) => l.damage_reported);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">SAC admin panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who has what, what's due back, and what came back broken.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => remind.mutate()}
            disabled={remind.isPending}
          >
            <BellRing className="size-4" />
            Send reminders now
          </Button>
          <Button variant="ghost" onClick={() => lock.mutate()}>
            <Lock className="size-4" />
            Lock
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Out now" value={open.length} icon={Boxes} />
        <Stat label="Overdue" value={overdue.length} icon={AlertTriangle} tone="warn" />
        <Stat label="Damage reports" value={damaged.length} icon={Wrench} tone="warn" />
        <Stat label="Running low" value={data.lowStock.length} icon={Boxes} />
      </div>

      <Tabs defaultValue="loans" className="mt-8">
        <TabsList>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <MembersPanel />
        </TabsContent>

        <TabsContent value="catalogue" className="mt-6">
          <CataloguePanel />
        </TabsContent>

        <TabsContent value="loans">
      <section className="mt-8 space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Currently checked out ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            Everything is on the racks right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {open.map((l) => {
              const left = daysUntil(l.due_at);
              const label = `${l.quantity} × ${l.component_name}`;
              return (
                <li key={l.id} className="panel flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">
                      {l.member_name}
                      {l.member_email ? ` · ${l.member_email}` : ""} · taken{" "}
                      {formatDate(l.borrowed_at)}
                    </span>
                    <span className="mono-tag mt-0.5 block text-muted-foreground">
                      {l.rack_code ?? "—"}
                      {l.bin_label ? ` · bin ${l.bin_label}` : ""}
                      {l.extended_count > 0 ? ` · extended ${l.extended_count}×` : ""}
                    </span>
                  </span>
                  <Badge variant={left < 0 ? "destructive" : left <= 1 ? "outline" : "secondary"}>
                    {left < 0 ? `${Math.abs(left)}d late` : `due ${formatDate(l.due_at)}`}
                  </Badge>
                  <ReturnDialog
                    itemLabel={label}
                    pending={returnLoan.isPending}
                    onConfirm={({ damaged: isDamaged, damageNote }) =>
                      returnLoan.mutateAsync({
                        recordId: l.id,
                        damaged: isDamaged,
                        damageNote,
                      })
                    }
                    trigger={
                      <Button size="sm" variant="secondary">
                        Log return
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-destructive">
          Damage reports ({damaged.length})
        </h2>
        {damaged.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">No damaged parts reported.</p>
        ) : (
          <ul className="space-y-2">
            {damaged.map((l) => (
              <li key={l.id} className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
                <p className="font-medium">
                  {l.quantity} × {l.component_name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reported by {l.member_name} · {l.returned_at ? formatDate(l.returned_at) : "—"}
                </p>
                {l.damage_note ? <p className="mt-2 text-sm">{l.damage_note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Running low
        </h2>
        {data.lowStock.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">Stock levels look healthy.</p>
        ) : (
          <ul className="space-y-2">
            {data.lowStock.map((c) => (
              <li key={c.id} className="panel flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="mono-tag text-muted-foreground">{c.rack_code ?? "—"}</span>
                </span>
                <Badge variant="outline" className="text-warning">
                  {c.available}/{c.total} left
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent returns
        </h2>
        <ul className="space-y-2">
          {data.loans
            .filter((l) => l.returned_at)
            .slice(0, 15)
            .map((l) => (
              <li key={l.id} className="panel flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {l.quantity} × {l.component_name} — {l.member_name}
                </span>
                {l.damage_reported ? <Badge variant="destructive">Damaged</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {formatDate(l.returned_at!)}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}
