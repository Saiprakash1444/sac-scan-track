import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Boxes, ChevronRight, Plus, Search } from "lucide-react";

import { AddPartDialog } from "@/components/AddPartDialog";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ComponentDetail, LocationLine, StockBadge } from "@/components/ComponentDetail";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CountInput } from "@/components/CountInput";
import type { Component } from "@/lib/inventory.functions";
import { binText, countingModeQuery, inventoryQuery, meQuery, sectionTitle } from "@/lib/queries";

/** Name, category, specs, bin and keywords — everything a member might type. */
function matches(c: Component, q: string) {
  if (!q) return true;
  return [c.name, c.category, c.specs ?? "", c.bin_label ?? "", ...(c.keywords ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export const Route = createFileRoute("/_authenticated/find")({
  validateSearch: z.object({
    q: z.string().optional(),
    tab: z.enum(["parts", "sections"]).optional(),
    section: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Browse | RMI Inventory" },
      {
        name: "description",
        content:
          "Search a part to see which section and bin it sits in, or open a section to list everything stored there.",
      },
      { property: "og:title", content: "Browse | RMI Inventory" },
      {
        property: "og:description",
        content: "Search the RMI catalogue by name, or browse section by section.",
      },
    ],
  }),
  component: FindPage,
});

function FindPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const inventory = useQuery(inventoryQuery());
  const [term, setTerm] = useState(params.q ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionTerm, setSectionTerm] = useState("");
  const [toCountOnly, setToCountOnly] = useState(false);
  const tab = params.tab ?? (params.section ? "sections" : "parts");
  const rackId = params.section ?? null;
  const setRackId = (id: string | null) => {
    setSectionTerm("");
    navigate({ search: { tab: "sections", section: id ?? undefined } });
  };
  const counting = useQuery(countingModeQuery());
  const me = useQuery(meQuery());
  const canCount = counting.data === "open" || me.data?.isAdmin === true;
  const countFilter = canCount && toCountOnly;

  const components = useMemo(() => inventory.data?.components ?? [], [inventory.data]);
  const racks = inventory.data?.racks ?? [];

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    return components
      .filter((c) => matches(c, q) && (!countFilter || c.count_pending))
      .slice(0, 60);
  }, [components, term, countFilter]);

  const selected = components.find((c) => c.id === selectedId);
  const selectedRack = racks.find((r) => r.id === selected?.rack_id);
  const openRack = racks.find((r) => r.id === rackId);
  const rackItems = components.filter((c) => c.rack_id === rackId);
  const pendingInRack = rackItems.filter((c) => c.count_pending).length;
  const rackGroups = useMemo(() => {
    const q = sectionTerm.trim().toLowerCase();
    const groups = new Map<string, Component[]>();
    for (const c of components.filter(
      (x) => x.rack_id === rackId && matches(x, q) && (!countFilter || x.count_pending),
    )) {
      const key = c.bin_label ? binText(c.bin_label).replace(/^bin /, "Bin ") : "Other";
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [components, rackId, sectionTerm, countFilter]);
  const pendingTotal = components.filter((c) => c.count_pending).length;

  const toCountToggle = canCount ? (
    <button
      type="button"
      onClick={() => setToCountOnly((v) => !v)}
      aria-pressed={toCountOnly}
      className={
        toCountOnly
          ? "shrink-0 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
          : "shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      }
    >
      To count only
    </button>
  ) : null;

  /** One catalogue row: tap the name for details, or count it inline while counting is open. */
  const partRow = (c: Component, rack: typeof openRack, showLocation: boolean) => (
    <li
      key={c.id}
      className="panel flex flex-wrap items-center gap-3 p-3 transition-colors hover:border-primary/50"
    >
      <button
        type="button"
        onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate font-medium">{c.name}</span>
        {showLocation ? (
          <LocationLine component={c} rack={rack} />
        ) : c.specs ? (
          <span className="block truncate text-sm text-muted-foreground">{c.specs}</span>
        ) : null}
      </button>
      {canCount ? <CountInput component={c} /> : <StockBadge component={c} />}
      {canCount ? null : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </li>
  );

  return (
    <AppShell
      title="Browse"
      subtitle="Search by name, or open a section to see what's inside."
      action={
        <AddPartDialog
          racks={racks}
          defaultRackId={rackId}
          trigger={
            <Button size="sm" variant="secondary">
              <Plus className="size-4" />
              Add a part
            </Button>
          }
        />
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: { tab: v as "parts" | "sections", q: term || undefined } })
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="parts" className="flex-1">
            Parts
          </TabsTrigger>
          <TabsTrigger value="sections" className="flex-1">
            Sections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parts" className="mt-4 space-y-4">
          {canCount ? (
            <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
              <span className="font-medium text-primary">Stock count is open.</span> Search a part
              and enter how many are on the shelf, then tap ✓.{" "}
              {pendingTotal > 0
                ? `${pendingTotal} parts still to count.`
                : "Everything is counted."}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setSelectedId(null);
                }}
                placeholder="e.g. servo, L298N, jumper wires"
                className="pl-9"
                autoFocus={!params.section}
              />
            </div>
            {toCountToggle}
          </div>

          {selected ? (
            <ComponentDetail
              component={selected}
              rack={selectedRack}
              onDone={() => setSelectedId(null)}
            />
          ) : null}

          {inventory.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((c) =>
                partRow(
                  c,
                  racks.find((r) => r.id === c.rack_id),
                  true,
                ),
              )}
              {results.length === 0 && countFilter ? (
                <li className="panel p-4 text-sm text-muted-foreground">
                  Nothing left to count{term.trim() ? ` matching "${term}"` : ""}.
                </li>
              ) : null}
              {results.length === 0 && !countFilter ? (
                <li className="panel space-y-2 p-4 text-sm text-muted-foreground">
                  <p>Nothing matches "{term}". Try a broader word like "motor" or "sensor".</p>
                  <p>
                    Not in the room?{" "}
                    <Link
                      to="/requests"
                      search={{ name: term.trim() }}
                      className="font-medium text-primary hover:underline"
                    >
                      Ask the admins to get it
                    </Link>
                  </p>
                </li>
              ) : null}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="sections" className="mt-4 space-y-3">
          {openRack ? (
            <div className="space-y-3">
              <button
                onClick={() => setRackId(null)}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                ← All sections
              </button>
              <div className="panel p-4">
                <p className="mono-tag text-primary">{openRack.code}</p>
                <h2 className="font-display text-lg font-bold">{sectionTitle(openRack.name)}</h2>
                {openRack.location_note ? (
                  <p className="mt-1 text-sm text-muted-foreground">{openRack.location_note}</p>
                ) : null}
              </div>
              {canCount ? (
                <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
                  <span className="font-medium text-primary">Stock count is open.</span> Enter how
                  many of each item are on the shelf right now and tap ✓.
                  {pendingInRack > 0
                    ? ` ${pendingInRack} still to count here.`
                    : " All counted here."}
                </p>
              ) : null}
              {rackItems.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={sectionTerm}
                      onChange={(e) => setSectionTerm(e.target.value)}
                      placeholder={`Search in ${openRack.code} — name, bin, spec`}
                      className="pl-9"
                    />
                  </div>
                  {toCountToggle}
                </div>
              ) : null}
              {rackItems.length === 0 ? (
                <p className="panel p-4 text-sm text-muted-foreground">
                  Nothing catalogued in this section yet.
                </p>
              ) : rackGroups.length === 0 ? (
                <p className="panel p-4 text-sm text-muted-foreground">
                  {countFilter ? "Nothing left to count" : "Nothing"}
                  {sectionTerm.trim() ? ` matching "${sectionTerm}"` : ""} in this section.
                </p>
              ) : null}
              {rackGroups.map(([row, items]) => (
                <section key={row} className="space-y-2">
                  <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {row}
                  </h3>
                  <ul className="space-y-2">
                    {items.map((c) =>
                      c.id === selectedId ? (
                        <li key={c.id}>
                          <ComponentDetail
                            component={c}
                            rack={openRack}
                            onDone={() => setSelectedId(null)}
                          />
                        </li>
                      ) : (
                        partRow(c, openRack, false)
                      ),
                    )}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {racks.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setRackId(r.id)}
                    className="panel flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                      <Boxes className="size-4 text-primary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mono-tag block text-primary">{r.code}</span>
                      <span className="block truncate font-medium">{sectionTitle(r.name)}</span>
                      <span className="text-xs text-muted-foreground">
                        {components.filter((c) => c.rack_id === r.id).length} kinds of parts
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
