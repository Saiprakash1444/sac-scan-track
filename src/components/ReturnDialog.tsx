import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Return flow with the optional damage report. Kept generic so both the member
 * screen and the admin panel can reuse it.
 */
export function ReturnDialog({
  itemLabel,
  trigger,
  pending,
  onConfirm,
}: {
  itemLabel: string;
  trigger: ReactNode;
  pending?: boolean;
  onConfirm: (input: { damaged: boolean; damageNote?: string }) => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [damaged, setDamaged] = useState(false);
  const [note, setNote] = useState("");

  async function confirm() {
    await onConfirm({ damaged, damageNote: damaged ? note : undefined });
    setOpen(false);
    setDamaged(false);
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return {itemLabel}</DialogTitle>
          <DialogDescription>
            Put the part back in its bin, then confirm. Flag it if anything is broken so admins can
            pull it from stock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3">
            <Checkbox
              id="damaged"
              checked={damaged}
              onCheckedChange={(v) => setDamaged(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="damaged" className="cursor-pointer text-sm font-medium leading-snug">
              This item is damaged / not working
            </Label>
          </div>

          {damaged ? (
            <div className="space-y-1.5">
              <Label htmlFor="damage-note">What happened?</Label>
              <Textarea
                id="damage-note"
                value={note}
                maxLength={300}
                placeholder="e.g. motor driver burnt out, one pin snapped"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={pending || (damaged && note.trim().length === 0)}
            variant={damaged ? "destructive" : "default"}
          >
            {damaged ? "Return as damaged" : "Confirm return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
