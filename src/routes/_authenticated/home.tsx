import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Boxes, Camera, ChevronRight, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { StockBadge } from "@/components/ComponentDetail";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  borrowLogQuery,
  daysUntil,
  formatDate,
  inventoryQuery,
  meQuery,
  sectionTitle,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home | RMI Inventory" },
      {
        name: "description",
        content: "What's in the RMI club room, where it lives, and what you're holding.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const me = useQuery(meQuery());
  const inventory = useQuery(inventoryQuery());
  const loans = useQuery(borrowLogQuery("mine", true));
  const [term, setTerm] = useState("");

  const components = useMemo(() => inventory.data?.components ?? [], [inventory.data]);
  const racks = useMemo(() => inventory.data?.racks ?? [], [inventory.data]);
  const myLoans = loans.data ?? [];
  const firstName = (me.data?.profile?.full_name ?? "").split(" ")[0];

  const stats = useMemo(() => {
    let inRoom = 0;
    let out = 0;
    for (const c of components) {
      inRoom += c.quantity_available;
      out += Math.max(0, c.quantity_total - c.quantity_available);
    }
    return { kinds: components.length, inRoom, out, sections: racks.length };
  }, [components, racks]);

  const sections = useMemo(
    () =>
      racks.map((r) => {
        const items = components.filter((c) => c.rack_id === r.id);
        return {
          ...r,
          kinds: items.length,
          units: items.reduce((sum, c) => sum + c.quantity_total, 0),
        };
      }),
    [racks, components],
  );
  const unsorted = components.filter((c) => !c.rack_id).length;

  const runningLow = useMemo(
    () =>
      components
        .filter(
          (c) =>
            c.borrowable && c.quantity_total > 1 && c.quantity_available / c.quantity_total < 0.34,
        )
        .sort((a, b) => a.quantity_available - b.quantity_available)
        .slice(0, 6),
    [components],
  );

  function search(event: React.FormEvent) {
    event.preventDefault();
    navigate({ to: "/find", search: { q: term.trim() || undefined } });
  }

  return (
    <AppShell
      title={firstName ? `Hi, ${firstName}` : "RMI club room"}
      subtitle="Everything in the club room, where it lives, and what's out."
    >
      <div className="space-y-6">
        <form onSubmit={search} className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find a part — servo, ESP32, multimeter…"
            className="h-12 pl-10 text-base"
          />
        </form>

        <MyLoans loading={loans.isLoading} loans={myLoans} />

        {inventory.isLoading ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Kinds of parts" value={stats.kinds} />
            <Stat label="Units on the shelves" value={stats.inRoom} />
            <Stat label="Units out on loan" value={stats.out} />
            <Stat label="Sections" value={stats.sections} />
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Sections</h2>
            <Link
              to="/find"
              search={{ tab: "sections" }}
              className="text-sm text-primary hover:underline"
            >
              Browse all
            </Link>
          </div>
          {inventory.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/find"
                    search={{ tab: "sections", section: s.id }}
                    className="panel flex h-full items-start gap-3 p-4 transition-colors hover:border-primary/60"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary">
                      {s.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{sectionTitle(s.name)}</span>
                      {s.location_note ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.location_note}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {s.kinds} kinds · {s.units} units
                      </span>
                    </span>
                    <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
              {unsorted > 0 ? (
                <li className="panel flex items-center gap-3 border-dashed p-4 text-sm text-muted-foreground">
                  <Boxes className="size-5 shrink-0" />
                  {unsorted} part{unsorted === 1 ? "" : "s"} not assigned to a section yet
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {runningLow.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="size-4 text-warning" />
              Running low
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {runningLow.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/find"
                    search={{ q: c.name }}
                    className="panel flex items-center gap-3 p-3 transition-colors hover:border-primary/60"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <StockBadge component={c} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          to="/scan"
          className="panel flex items-center gap-3 p-4 text-sm transition-colors hover:border-primary/60"
        >
          <Camera className="size-5 shrink-0 text-primary" />
          <span className="flex-1">
            <span className="block font-medium">Found a part and not sure what it is?</span>
            <span className="text-muted-foreground">
              Scan its QR label or take a photo to identify it.
            </span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-4">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MyLoans({
  loading,
  loans,
}: {
  loading: boolean;
  loans: { id: string; quantity: number; component_name: string; due_at: string }[];
}) {
  if (loading) return <Skeleton className="h-20 w-full" />;

  if (loans.length === 0) {
    return (
      <div className="panel flex items-center justify-between gap-3 p-4 text-sm">
        <span className="text-muted-foreground">You're not holding anything from the room.</span>
        <Link to="/my-items" className="shrink-0 text-primary hover:underline">
          History
        </Link>
      </div>
    );
  }

  const sorted = [...loans].sort((a, b) => a.due_at.localeCompare(b.due_at));
  return (
    <section className="panel p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">You're holding {loans.length}</h2>
        <Link to="/my-items" className="text-sm text-primary hover:underline">
          Return or extend
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {sorted.slice(0, 3).map((l) => {
          const days = daysUntil(l.due_at);
          return (
            <li key={l.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {l.quantity} × {l.component_name}
              </span>
              <Badge
                variant={days < 0 ? "destructive" : "outline"}
                className={days >= 0 && days <= 1 ? "text-warning" : undefined}
              >
                {days < 0
                  ? `${-days}d overdue`
                  : days === 0
                    ? "due today"
                    : `due ${formatDate(l.due_at)}`}
              </Badge>
            </li>
          );
        })}
        {sorted.length > 3 ? (
          <li className="text-xs text-muted-foreground">+{sorted.length - 3} more</li>
        ) : null}
      </ul>
    </section>
  );
}
