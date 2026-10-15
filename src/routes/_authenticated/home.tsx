import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, PackagePlus, PackageSearch, Search, ShoppingCart } from "lucide-react";

import { AddPartDialog } from "@/components/AddPartDialog";
import { AppShell } from "@/components/AppShell";
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
        content: "Find, borrow, add or request parts for the RMI club room.",
      },
    ],
  }),
  component: HomePage,
});

const ACTION_CLASS =
  "panel flex w-full flex-col items-start gap-2 p-4 text-left transition-colors hover:border-primary/60";

function HomePage() {
  const navigate = useNavigate();
  const me = useQuery(meQuery());
  const inventory = useQuery(inventoryQuery());
  const loans = useQuery(borrowLogQuery("mine", true));
  const [term, setTerm] = useState("");

  const racks = inventory.data?.racks ?? [];
  const firstName = (me.data?.profile?.full_name ?? "").split(" ")[0];

  function search(event: React.FormEvent) {
    event.preventDefault();
    navigate({ to: "/find", search: { q: term.trim() || undefined } });
  }

  return (
    <AppShell title={firstName ? `Hi, ${firstName}` : "RMI club room"}>
      <div className="space-y-6">
        <form onSubmit={search} className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search parts — servo, ESP32, multimeter…"
            className="h-12 pl-10 pr-12 text-base"
          />
          <Link
            to="/scan"
            aria-label="Identify a part with the camera"
            title="Identify a part with the camera"
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Camera className="size-4" />
          </Link>
        </form>

        <div className="grid grid-cols-3 gap-2">
          <Link to="/find" className={ACTION_CLASS}>
            <PackageSearch className="size-5 text-primary" />
            <span className="text-sm font-medium leading-tight">Borrow a part</span>
          </Link>
          <AddPartDialog
            racks={racks}
            trigger={
              <button type="button" className={ACTION_CLASS}>
                <PackagePlus className="size-5 text-primary" />
                <span className="text-sm font-medium leading-tight">Add a part</span>
              </button>
            }
          />
          <Link to="/requests" className={ACTION_CLASS}>
            <ShoppingCart className="size-5 text-primary" />
            <span className="text-sm font-medium leading-tight">Request a part</span>
          </Link>
        </div>

        <MyLoans loading={loans.isLoading} loans={loans.data ?? []} />

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Browse by section
          </h2>
          {inventory.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {racks.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/find"
                    search={{ tab: "sections", section: r.id }}
                    className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/60"
                  >
                    <span className="font-semibold text-primary">{r.code}</span>
                    <span>{sectionTitle(r.name)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function MyLoans({
  loading,
  loans,
}: {
  loading: boolean;
  loans: { id: string; quantity: number; component_name: string; due_at: string }[];
}) {
  if (loading) return <Skeleton className="h-16 w-full" />;
  if (loans.length === 0) return null;

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
