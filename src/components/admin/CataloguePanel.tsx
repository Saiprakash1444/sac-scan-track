import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  dismissScan,
  getAdminCatalogue,
  removeComponent,
  saveComponent,
  saveRack,
} from "@/lib/admin.functions";

const catalogueKey = ["admin-catalogue"] as const;

type Rack = { id: string; code: string; name: string };
type Row = {
  id: string;
  name: string;
  category: string;
  specs: string | null;
  quantity_total: number;
  quantity_available: number;
  rack_id: string | null;
  bin_label: string | null;
  qr_code: string | null;
  keywords: string[];
  borrowable: boolean;
};

type Draft = Omit<Row, "id" | "keywords"> & { id: string | null; keywords: string };

function blankDraft(): Draft {
  return {
    id: null,
    name: "",
    category: "misc",
    specs: "",
    quantity_total: 1,
    quantity_available: 1,
    rack_id: null,
    bin_label: "",
    qr_code: "",
    keywords: "",
    borrowable: true,
  };
}

function ComponentDialog({
  racks,
  initial,
  trigger,
  onSaved,
}: {
  racks: Rack[];
  initial: Draft;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(initial);
  const save = useServerFn(saveComponent);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: draft.id,
          name: draft.name,
          category: draft.category || "misc",
          specs: draft.specs?.trim() ? draft.specs.trim() : null,
          quantity_total: Number(draft.quantity_total),
          quantity_available: Number(draft.quantity_available),
          rack_id: draft.rack_id,
          bin_label: draft.bin_label?.trim() ? draft.bin_label.trim() : null,
          qr_code: draft.qr_code?.trim() ? draft.qr_code.trim() : null,
          keywords: draft.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          borrowable: draft.borrowable,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(initial);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit component" : "Add component"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bin label</Label>
              <Input
                value={draft.bin_label ?? ""}
                onChange={(e) => setDraft({ ...draft, bin_label: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Specs</Label>
            <Textarea
              rows={2}
              value={draft.specs ?? ""}
              onChange={(e) => setDraft({ ...draft, specs: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Total</Label>
              <Input
                type="number"
                min={0}
                value={draft.quantity_total}
                onChange={(e) =>
                  setDraft({ ...draft, quantity_total: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Available</Label>
              <Input
                type="number"
                min={0}
                value={draft.quantity_available}
                onChange={(e) =>
                  setDraft({ ...draft, quantity_available: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rack</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.rack_id ?? ""}
              onChange={(e) => setDraft({ ...draft, rack_id: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {racks.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>QR code</Label>
              <Input
                value={draft.qr_code ?? ""}
                onChange={(e) => setDraft({ ...draft, qr_code: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Keywords (comma separated)</Label>
              <Input
                value={draft.keywords}
                onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Can be checked out</p>
              <p className="text-xs text-muted-foreground">Off = stays in the room</p>
            </div>
            <Switch
              checked={draft.borrowable}
              onCheckedChange={(v) => setDraft({ ...draft, borrowable: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !draft.name.trim()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RackDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "", location_note: "" });
  const save = useServerFn(saveRack);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: null,
          code: form.code,
          name: form.name,
          description: form.description.trim() || null,
          location_note: form.location_note.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Rack added");
      setOpen(false);
      setForm({ code: "", name: "", description: "", location_note: "" });
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" />
          Add rack
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rack</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Where it is</Label>
            <Input
              value={form.location_note}
              onChange={(e) => setForm({ ...form, location_note: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.code.trim() || !form.name.trim()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CataloguePanel() {
  const fetchCatalogue = useServerFn(getAdminCatalogue);
  const doRemove = useServerFn(removeComponent);
  const doDismiss = useServerFn(dismissScan);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");

  const catalogue = useQuery({ queryKey: catalogueKey, queryFn: () => fetchCatalogue() });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: catalogueKey });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => doRemove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => doDismiss({ data: { id } }),
    onSuccess: refresh,
  });

  if (catalogue.isLoading) return <Skeleton className="h-64 w-full" />;

  const racks = (catalogue.data?.racks ?? []) as Rack[];
  const components = (catalogue.data?.components ?? []) as Row[];
  const unknownScans = catalogue.data?.unknownScans ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? components.filter((c) =>
        `${c.name} ${c.category} ${c.specs ?? ""}`.toLowerCase().includes(needle),
      )
    : components;

  return (
    <div className="space-y-8">
      {unknownScans.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-accent">
            Spotted by the camera, not in the catalogue ({unknownScans.length})
          </h2>
          <ul className="space-y-2">
            {unknownScans.map((s) => (
              <li key={s.id} className="panel flex flex-wrap items-center gap-3 p-3">
                <Sparkles className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.guessed_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.guessed_category ?? "—"}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </span>
                </span>
                <ComponentDialog
                  racks={racks}
                  initial={{
                    ...blankDraft(),
                    name: s.guessed_name,
                    category: s.guessed_category || "misc",
                    specs: s.notes ?? "",
                  }}
                  onSaved={() => {
                    dismiss.mutate(s.id);
                    refresh();
                  }}
                  trigger={
                    <Button size="sm">
                      <Plus className="size-4" />
                      Add to catalogue
                    </Button>
                  }
                />
                <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(s.id)}>
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Catalogue ({components.length})
          </h2>
          <RackDialog onSaved={refresh} />
          <ComponentDialog
            racks={racks}
            initial={blankDraft()}
            onSaved={refresh}
            trigger={
              <Button>
                <Plus className="size-4" />
                Add component
              </Button>
            }
          />
        </div>

        <Input
          placeholder="Filter components…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <ul className="space-y-2">
          {visible.map((c) => {
            const rack = racks.find((r) => r.id === c.rack_id);
            return (
              <li key={c.id} className="panel flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="mono-tag text-muted-foreground">
                    {rack?.code ?? "unassigned"}
                    {c.bin_label ? ` · bin ${c.bin_label}` : ""} · {c.category}
                  </span>
                </span>
                {!c.borrowable ? <Badge variant="outline">room only</Badge> : null}
                <Badge variant="secondary">
                  {c.quantity_available}/{c.quantity_total}
                </Badge>
                <ComponentDialog
                  racks={racks}
                  initial={{ ...c, keywords: (c.keywords ?? []).join(", ") }}
                  onSaved={refresh}
                  trigger={
                    <Button size="sm" variant="secondary">
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete ${c.name}?`)) remove.mutate(c.id);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
