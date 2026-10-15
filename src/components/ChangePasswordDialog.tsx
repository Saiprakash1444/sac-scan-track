import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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

const MIN_LENGTH = 8;

/**
 * Members swap the admin-issued password for their own. The current password
 * is checked first, so an unlocked phone left in the room can't be used to
 * take over the account.
 */
export function ChangePasswordDialog({ email, trigger }: { email: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsOld = next.length > 0 && next === current;
  const ready = !!current && next.length >= MIN_LENGTH && next === confirm && !sameAsOld && !busy;

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error("Your current password isn't right");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      toast.success("Password changed — use the new one next time you sign in");
      reset();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>
        <form id="change-password" onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={next}
              aria-invalid={tooShort || sameAsOld}
              onChange={(e) => setNext(e.target.value)}
            />
            <p
              className={
                tooShort || sameAsOld ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {sameAsOld
                ? "Pick something different from your current password"
                : `At least ${MIN_LENGTH} characters`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Type it again</Label>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={mismatch}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch ? <p className="text-xs text-destructive">Passwords don't match</p> : null}
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="change-password" disabled={!ready}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Change password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
