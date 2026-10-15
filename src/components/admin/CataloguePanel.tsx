import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardPaste, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

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
  addComponents,
  dismissScan,
  getAdminCatalogue,
  removeComponent,
  removeRack,
  saveComponent,
  saveRack,
} from "@/lib/admin.functions";
import { sectionTitle } from "@/lib/queries";

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
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
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
                onChange={(e) => setDraft({ ...draft, quantity_total: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Available</Label>
              <Input
                type="number"
                min={0}
                value={draft.quantity_available}
                onChange={(e) => setDraft({ ...draft, quantity_available: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Section</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.rack_id ?? ""}
              onChange={(e) => setDraft({ ...draft, rack_id: e.target.value || null })}
            >
              <option value="">No section</option>
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
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !draft.name.trim()}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Section = Rack & { description: string | null; location_note: string | null };

function SectionDialog({
  initial,
  trigger,
  onSaved,
}: {
  initial?: Section;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const empty = { code: "", name: "", description: "", location_note: "" };
  const fromInitial = () =>
    initial
      ? {
          code: initial.code,
          name: initial.name,
          description: initial.description ?? "",
          location_note: initial.location_note ?? "",
        }
      : empty;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fromInitial);
  const save = useServerFn(saveRack);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: initial?.id ?? null,
          code: form.code,
          name: form.name,
          description: form.description.trim() || null,
          location_note: form.location_note.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success(initial ? "Section updated" : "Section added");
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
        if (next) setForm(fromInitial());
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${initial.code}` : "New section"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label>Short code</Label>
              <Input
                placeholder="R7"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Soldering station"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Where it is in the room</Label>
            <Input
              placeholder="Back wall, next to the workbench"
              value={form.location_note}
              onChange={(e) => setForm({ ...form, location_note: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>What goes here (optional)</Label>
            <Input
              placeholder="Irons, solder, flux, desoldering pumps"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The short code is what goes on the shelf label and shows next to every part, so keep it
            to a few characters.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.code.trim() || !form.name.trim()}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BulkRow = {
  name: string;
  quantity: string;
  bin_label: string;
  category: string;
  specs: string;
};

const blankRow = (): BulkRow => ({
  name: "",
  quantity: "1",
  bin_label: "",
  category: "",
  specs: "",
});

/**
 * Rows copied from Google Sheets / Excel arrive tab-separated; CSV lines are
 * comma-separated. Column order: name, quantity, bin, category, specs.
 * A first row whose quantity isn't a number is treated as a header and skipped.
 */
function parsePasted(text: string): BulkRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((line) => {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) =>
      c.trim().replace(/^"|"$/g, ""),
    );
    return {
      name: cells[0] ?? "",
      quantity: cells[1] || "1",
      bin_label: cells[2] ?? "",
      category: cells[3] ?? "",
      specs: cells.slice(4).join(", "),
    };
  });
  if (rows.length && Number.isNaN(Number(rows[0].quantity))) rows.shift();
  return rows.filter((r) => r.name);
}

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim());

function BulkAddDialog({
  section,
  trigger,
  onSaved,
}: {
  section: Section;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const add = useServerFn(addComponents);

  const filled = rows.filter((r) => r.name.trim());
  const invalid = filled.some((r) => !isWholeNumber(r.quantity));
  const pastedCount = pasting ? parsePasted(pasted).length : 0;

  const mutation = useMutation({
    mutationFn: () =>
      add({
        data: {
          rows: filled.map((r) => {
            const qty = Number(r.quantity);
            return {
              name: r.name.trim(),
              category: r.category.trim() || "misc",
              specs: r.specs.trim() || null,
              quantity_total: qty,
              quantity_available: qty,
              rack_id: section.id,
              bin_label: r.bin_label.trim() || null,
              qr_code: null,
              keywords: [],
              borrowable: true,
            };
          }),
        },
      }),
    onSuccess: (result) => {
      toast.success(
        `Added ${result.added} part${result.added === 1 ? "" : "s"} to ${section.code}`,
      );
      setOpen(false);
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add parts"),
  });

  const update = (i: number, patch: Partial<BulkRow>) =>
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setRows([blankRow(), blankRow(), blankRow()]);
          setPasting(false);
          setPasted("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Add parts to {section.code} · {sectionTitle(section.name)}
          </DialogTitle>
        </DialogHeader>

        {pasting ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Copy rows from Google Sheets or Excel and paste them below. Columns in this order:{" "}
              <span className="font-medium text-foreground">
                Name · Quantity · Bin · Category · Specs
              </span>
              . Only the name is required, and a header row is skipped automatically.
            </p>
            <Textarea
              rows={8}
              autoFocus
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={
                "Soldering iron 60W\t5\tS-01\ttool\tTemperature adjustable\nSolder wire 0.8mm\t10\tS-02\tconsumable"
              }
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                disabled={pastedCount === 0}
                onClick={() => {
                  setRows(parsePasted(pasted));
                  setPasting(false);
                }}
              >
                Load {pastedCount || ""} row{pastedCount === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={() => setPasting(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                One line per part. Empty lines are ignored.
              </p>
              <Button size="sm" variant="secondary" onClick={() => setPasting(true)}>
                <ClipboardPaste className="size-4" />
                Paste from a sheet
              </Button>
            </div>

            <div className="hidden grid-cols-[1fr_72px_88px_110px_36px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
              <span>Name</span>
              <span>Qty</span>
              <span>Bin</span>
              <span>Category</span>
              <span />
            </div>
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[1fr_72px] gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_72px_88px_110px_36px] sm:border-0 sm:p-0"
                >
                  <Input
                    placeholder="Part name"
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                  <Input
                    inputMode="numeric"
                    placeholder="Qty"
                    value={r.quantity}
                    aria-invalid={!!r.name.trim() && !isWholeNumber(r.quantity)}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                  />
                  <Input
                    placeholder="Bin"
                    value={r.bin_label}
                    onChange={(e) => update(i, { bin_label: e.target.value })}
                  />
                  <Input
                    placeholder="Category"
                    value={r.category}
                    onChange={(e) => update(i, { category: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove row"
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                    className="col-span-2 justify-self-end sm:col-span-1"
                  >
                    <X className="size-4" />
                  </Button>
                  {r.specs ? (
                    <p className="col-span-2 truncate px-1 text-xs text-muted-foreground sm:col-span-5">
                      Specs: {r.specs}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRows((all) => [...all, blankRow()])}
            >
              <Plus className="size-4" />
              Another row
            </Button>
          </div>
        )}

        {!pasting ? (
          <DialogFooter className="items-center gap-2">
            {invalid ? (
              <span className="mr-auto text-xs text-destructive">
                Quantity must be a whole number
              </span>
            ) : (
              <span className="mr-auto text-xs text-muted-foreground">
                {filled.length} part{filled.length === 1 ? "" : "s"} ready. To mark one room-only,
                edit it after adding.
              </span>
            )}
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || filled.length === 0 || invalid}
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Add {filled.length || ""} to {section.code}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CataloguePanel() {
  const fetchCatalogue = useServerFn(getAdminCatalogue);
  const doRemove = useServerFn(removeComponent);
  const doRemoveRack = useServerFn(removeRack);
  const doDismiss = useServerFn(dismissScan);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");

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

  const removeSection = useMutation({
    mutationFn: (id: string) => doRemoveRack({ data: { id } }),
    onSuccess: () => {
      toast.success("Section deleted");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => doDismiss({ data: { id } }),
    onSuccess: refresh,
  });

  if (catalogue.isLoading) return <Skeleton className="h-64 w-full" />;

  const sections = (catalogue.data?.racks ?? []) as Section[];
  const components = (catalogue.data?.components ?? []) as Row[];
  const unknownScans = catalogue.data?.unknownScans ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = components.filter((c) => {
    if (sectionFilter === "none" && c.rack_id) return false;
    if (sectionFilter !== "all" && sectionFilter !== "none" && c.rack_id !== sectionFilter) {
      return false;
    }
    return !needle || `${c.name} ${c.category} ${c.specs ?? ""}`.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-8">
      {unknownScans.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
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
                  racks={sections}
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
          <h2 className="mr-auto text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sections ({sections.length})
          </h2>
          <SectionDialog
            onSaved={refresh}
            trigger={
              <Button>
                <Plus className="size-4" />
                New section
              </Button>
            }
          />
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {sections.map((section) => {
            const parts = components.filter((c) => c.rack_id === section.id);
            const units = parts.reduce((sum, c) => sum + c.quantity_total, 0);
            return (
              <li key={section.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 px-2 text-sm font-semibold text-primary">
                    {section.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{sectionTitle(section.name)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {section.location_note || "No location noted"}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {parts.length} kinds · {units} units
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BulkAddDialog
                    section={section}
                    onSaved={refresh}
                    trigger={
                      <Button size="sm">
                        <Plus className="size-4" />
                        Add parts
                      </Button>
                    }
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSectionFilter(section.id)}
                  >
                    View parts
                  </Button>
                  <SectionDialog
                    initial={section}
                    onSaved={refresh}
                    trigger={
                      <Button size="sm" variant="ghost" aria-label={`Edit ${section.code}`}>
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${section.code}`}
                    disabled={parts.length > 0 || removeSection.isPending}
                    title={
                      parts.length > 0
                        ? "Move or delete its parts before deleting the section"
                        : undefined
                    }
                    onClick={() => {
                      if (confirm(`Delete section ${section.code} — ${section.name}?`)) {
                        removeSection.mutate(section.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Parts ({visible.length}
            {visible.length !== components.length ? ` of ${components.length}` : ""})
          </h2>
          <ComponentDialog
            racks={sections}
            initial={{
              ...blankDraft(),
              rack_id: sectionFilter !== "all" && sectionFilter !== "none" ? sectionFilter : null,
            }}
            onSaved={refresh}
            trigger={
              <Button variant="outline">
                <Plus className="size-4" />
                Add one part
              </Button>
            }
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
          <Input
            placeholder="Filter parts…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="all">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {sectionTitle(s.name)}
              </option>
            ))}
            <option value="none">Not in a section</option>
          </select>
        </div>

        <ul className="space-y-2">
          {visible.map((c) => {
            const section = sections.find((r) => r.id === c.rack_id);
            return (
              <li key={c.id} className="panel flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="mono-tag text-muted-foreground">
                    {section?.code ?? "no section"}
                    {c.bin_label ? ` · bin ${c.bin_label}` : ""} · {c.category}
                  </span>
                </span>
                {!c.borrowable ? <Badge variant="outline">room only</Badge> : null}
                <Badge variant="secondary">
                  {c.quantity_available}/{c.quantity_total}
                </Badge>
                <ComponentDialog
                  racks={sections}
                  initial={{ ...c, keywords: (c.keywords ?? []).join(", ") }}
                  onSaved={refresh}
                  trigger={
                    <Button size="sm" variant="secondary" aria-label={`Edit ${c.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    if (confirm(`Delete ${c.name}?`)) remove.mutate(c.id);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li className="panel p-4 text-sm text-muted-foreground">No parts match.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
