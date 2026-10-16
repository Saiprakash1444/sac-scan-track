import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";

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
import { reportDamage, type Component } from "@/lib/inventory.functions";

/**
 * Flag a part found broken on the shelf. Borrowed parts are flagged through
 * ReturnDialog instead, so this is for everything else.
 */
export function ReportDamageDialog({ component }: { component: Component }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const submit = useServerFn(reportDamage);
  const qtyOk = /^\d+$/.test(quantity.trim()) && Number(quantity) >= 1;

  const mutation = useMutation({
    mutationFn: () =>
      submit({ data: { componentId: component.id, quantity: Number(quantity), note } }),
    onSuccess: () => {
      toast.success("Damage reported — thanks", {
        description: "An admin will check it and take it out of stock.",
      });
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send the report"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuantity("1");
          setNote("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          <Wrench className="size-3.5" />
          Found one broken? Report damage
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report damaged {component.name}</DialogTitle>
          <DialogDescription>
            For parts you found broken in the room. If you borrowed it, use Return on My items and
            tick "damaged" instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="damage-qty">How many are damaged?</Label>
            <Input
              id="damage-qty"
              inputMode="numeric"
              className="w-24"
              value={quantity}
              aria-invalid={!qtyOk}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="damage-what">What's wrong with it?</Label>
            <Textarea
              id="damage-what"
              rows={3}
              maxLength={300}
              placeholder="e.g. regulator gets hot and output is 0 V, one header pin snapped"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !qtyOk || !note.trim()}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
