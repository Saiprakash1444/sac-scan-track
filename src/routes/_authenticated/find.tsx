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
import { inventoryQuery, sectionTitle } from "@/lib/queries";

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
  const tab = params.tab ?? (params.section ? "sections" : "parts");
  const rackId = params.section ?? null;
  const setRackId = (id: string | null) =>
    navigate({ search: { tab: "sections", section: id ?? undefined } });

  const components = inventory.data?.components ?? [];
  const racks = inventory.data?.racks ?? [];

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return components.slice(0, 40);
    return components
      .filter((c) =>
        [c.name, c.category, c.specs ?? "", ...(c.keywords ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 40);
  }, [components, term]);

  const selected = components.find((c) => c.id === selectedId);
  const selectedRack = racks.find((r) => r.id === selected?.rack_id);
  const openRack = racks.find((r) => r.id === rackId);
  const rackItems = components.filter((c) => c.rack_id === rackId);

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
          <div className="relative">
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
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    className="panel flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-primary/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <LocationLine
                        component={c}
                        rack={racks.find((r) => r.id === c.rack_id)}
                      />
                    </span>
                    <StockBadge component={c} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="panel space-y-2 p-4 text-sm text-muted-foreground">
                  <p>
                    Nothing matches "{term}". Try a broader word like "motor" or "sensor".
                  </p>
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
              <ul className="space-y-2">
                {rackItems.map((c) => (
                  <li key={c.id} className="panel flex items-center gap-3 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {c.bin_label ? `bin ${c.bin_label} · ` : ""}
                        {c.specs ?? c.category}
                      </span>
                    </span>
                    <StockBadge component={c} />
                  </li>
                ))}
                {rackItems.length === 0 ? (
                  <li className="panel p-4 text-sm text-muted-foreground">
                    Nothing catalogued in this section yet.
                  </li>
                ) : null}
              </ul>
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
                      <span className="block truncate font-medium">
                        {sectionTitle(r.name)}
                      </span>
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
