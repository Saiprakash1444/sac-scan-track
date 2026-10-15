import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitComponent, type Rack } from "@/lib/inventory.functions";
import { additionsModeQuery, sectionTitle } from "@/lib/queries";

const blank = (rackId: string | null) => ({
  name: "",
  quantity: "1",
  rackId: rackId ?? "",
  binLabel: "",
  category: "",
  specs: "",
  note: "",
});

/** Lets any active member add a part; the admin setting decides if it goes live now. */
export function AddPartDialog({
  racks,
  defaultRackId = null,
  trigger,
}: {
  racks: Rack[];
  defaultRackId?: string | null;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => blank(defaultRackId));
  const mode = useQuery({ ...additionsModeQuery(), enabled: open });
  const submit = useServerFn(submitComponent);
  const queryClient = useQueryClient();

  const quantityOk = /^\d+$/.test(form.quantity.trim());
  const direct = mode.data === "direct";

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          name: form.name,
          quantity: Number(form.quantity),
          rackId: form.rackId || null,
          binLabel: form.binLabel,
          category: form.category,
          specs: form.specs,
          note: form.note,
        },
      }),
    onSuccess: (result) => {
      if (result.status === "approved") {
        toast.success(`${form.name.trim()} added to the catalogue`);
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
      } else {
        toast.success("Sent to an admin for approval", {
          description: "You'll get a notification when it's reviewed.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add it"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setForm(blank(defaultRackId));
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a part</DialogTitle>
          <DialogDescription>
            {mode.isLoading
              ? " "
              : direct
                ? "It goes into the catalogue straight away, under your name."
                : "An admin will review it before it shows up in the catalogue."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="part-name">Name</Label>
              <Input
                id="part-name"
                placeholder="e.g. TP4056 charging module"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-qty">Quantity</Label>
              <Input
                id="part-qty"
                inputMode="numeric"
                value={form.quantity}
                aria-invalid={!quantityOk}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="part-section">Section</Label>
              <select
                id="part-section"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.rackId}
                onChange={(e) => setForm({ ...form, rackId: e.target.value })}
              >
                <option value="">Not sure / not sorted yet</option>
                {racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {sectionTitle(r.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-bin">Bin</Label>
              <Input
                id="part-bin"
                placeholder="B3-07"
                value={form.binLabel}
                onChange={(e) => setForm({ ...form, binLabel: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="part-category">Category</Label>
            <Input
              id="part-category"
              placeholder="sensor, motor, tool, power…"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="part-specs">Specs (optional)</Label>
            <Input
              id="part-specs"
              placeholder="Voltage, rating, model…"
              value={form.specs}
              onChange={(e) => setForm({ ...form, specs: e.target.value })}
            />
          </div>

          {direct ? null : (
            <div className="space-y-1.5">
              <Label htmlFor="part-note">Note for the admin (optional)</Label>
              <Textarea
                id="part-note"
                rows={2}
                placeholder="Where you found it, who donated it…"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name.trim() || !quantityOk || mode.isLoading}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {direct ? "Add to catalogue" : "Send for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
