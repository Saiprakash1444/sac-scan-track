import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Share2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createMember,
  getAdminMembers,
  resetMemberPassword,
  setMemberStatus,
} from "@/lib/admin.functions";
import { formatDate } from "@/lib/queries";

const membersKey = ["admin-members"] as const;

/** Shown once after an account is created or reset — never retrievable later. */
type IssuedCredential = {
  name: string;
  email: string;
  phone: string | null;
  password: string;
  isReset: boolean;
};

/** wa.me wants the number in international form with digits only; bare 10-digit = India. */
function whatsappNumber(phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function CredentialDialog({ issued, onDone }: { issued: IssuedCredential; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const message = [
    `Hi ${issued.name.split(" ")[0]}, here is your ${issued.isReset ? "new " : ""}RMI Inventory login.`,
    "",
    `Email: ${issued.email}`,
    `Password: ${issued.password}`,
    "",
    `Sign in at ${origin}/auth — you can change the password after signing in.`,
  ].join("\n");
  const encoded = encodeURIComponent(message);
  const waNumber = whatsappNumber(issued.phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the text and copy it by hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "RMI Inventory login", text: message });
    } catch (error) {
      // AbortError = the admin closed the share sheet; nothing to report.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error("Could not open the share sheet — use Copy instead.");
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onDone())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-warning" />
            {issued.isReset ? "New password" : "Login"} for {issued.name}
          </DialogTitle>
          <DialogDescription>
            Shown once. Send it now — passwords are stored encrypted, so it cannot be looked up
            again, only reset.
          </DialogDescription>
        </DialogHeader>

        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm">
          {message}
        </pre>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="secondary">
            <a
              href={`https://wa.me/${waNumber}?text=${encoded}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a
              href={`mailto:${encodeURIComponent(issued.email)}?subject=${encodeURIComponent("Your RMI Inventory login")}&body=${encoded}`}
            >
              <Mail className="size-4" />
              Email
            </a>
          </Button>
          {canShare ? (
            <Button variant="secondary" onClick={share}>
              <Share2 className="size-4" />
              More…
            </Button>
          ) : null}
          <Button variant="secondary" onClick={copy} className={canShare ? "" : "col-span-2"}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        {issued.phone ? null : (
          <p className="text-xs text-muted-foreground">
            No phone number on file, so WhatsApp will ask you to pick the chat.
          </p>
        )}

        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MembersPanel() {
  const fetchMembers = useServerFn(getAdminMembers);
  const setStatus = useServerFn(setMemberStatus);
  const addMember = useServerFn(createMember);
  const resetPassword = useServerFn(resetMemberPassword);
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [filter, setFilter] = useState("");

  const members = useQuery({
    queryKey: membersKey,
    queryFn: () => fetchMembers(),
    refetchInterval: 60_000,
  });

  const mutate = useMutation({
    mutationFn: (input: { userId: string; status: "approved" | "rejected" | "pending" }) =>
      setStatus({ data: input }),
    onSuccess: () => {
      toast.success("Member updated");
      queryClient.invalidateQueries({ queryKey: membersKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed"),
  });

  const create = useMutation({
    mutationFn: () =>
      addMember({
        data: {
          fullName,
          email,
          rollNumber: rollNumber.trim() || null,
          phone: phone.trim() || null,
        },
      }),
    onSuccess: (result) => {
      setIssued({
        name: fullName,
        email,
        phone: phone.trim() || null,
        password: result.password,
        isReset: false,
      });
      setFullName("");
      setEmail("");
      setRollNumber("");
      setPhone("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: membersKey });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create the account"),
  });

  const reset = useMutation({
    mutationFn: (member: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    }) => resetPassword({ data: { userId: member.id } }).then((result) => ({ member, result })),
    onSuccess: ({ member, result }) => {
      setIssued({
        name: member.name,
        email: member.email ?? "",
        phone: member.phone,
        password: result.password,
        isReset: true,
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not reset the password"),
  });

  if (members.isLoading) return <Skeleton className="h-48 w-full" />;

  const rows = members.data ?? [];
  // `pending` = requests from "Request an account" on the sign-in page. They can
  // sign in but see a waiting screen and can't borrow until approved here.
  const pending = rows.filter((m) => m.approval_status === "pending");
  const rest = rows.filter((m) => m.approval_status !== "pending");
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? rest.filter((m) =>
        [m.full_name, m.email ?? "", m.roll_number ?? "", m.phone ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : rest;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add a member
          </h2>
          {!showForm ? (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <UserPlus className="size-4" />
              New member
            </Button>
          ) : null}
        </div>

        {issued ? <CredentialDialog issued={issued} onDone={() => setIssued(null)} /> : null}

        {showForm ? (
          <form
            className="panel space-y-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="member-name">Full name</Label>
                <Input
                  id="member-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aditi Sharma"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aditi@college.edu"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-roll">Roll number (optional)</Label>
                <Input
                  id="member-roll"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-phone">Phone (optional)</Label>
                <Input id="member-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The account is approved immediately and a first password is generated for you to pass
              on.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create account
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
                disabled={create.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      {pending.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-warning">
            Access requests ({pending.length})
          </h2>
          <ul className="space-y-2">
            {pending.map((m) => (
              <li
                key={m.id}
                className="panel flex flex-col gap-3 border-warning/40 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-medium">{m.full_name || "Unnamed"}</p>
                  <p className="break-all text-sm text-muted-foreground">{m.email ?? "—"}</p>
                  <p className="mono-tag text-muted-foreground">
                    {[m.roll_number, m.phone, `requested ${formatDate(m.created_at)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  <Button
                    size="sm"
                    onClick={() => mutate.mutate({ userId: m.id, status: "approved" })}
                    disabled={mutate.isPending}
                  >
                    {mutate.isPending && mutate.variables?.userId === m.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserCheck className="size-4" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => mutate.mutate({ userId: m.id, status: "rejected" })}
                    disabled={mutate.isPending}
                  >
                    <UserX className="size-4" />
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Members ({rest.length})
          </h2>
          {rest.length > 6 ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name, email, roll no."
                className="h-9 pl-9"
              />
            </div>
          ) : null}
        </div>
        {rest.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            No members yet. Use <span className="font-medium">New member</span> above to create the
            first account.
          </p>
        ) : shown.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">No member matches "{filter}".</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((m) => {
              const name = m.full_name || "Unnamed";
              const approved = m.approval_status === "approved";
              return (
                <li
                  key={m.id}
                  className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{name}</span>
                      <Badge variant={approved ? "secondary" : "destructive"} className="shrink-0">
                        {approved ? (
                          <>
                            <Check className="size-3" /> active
                          </>
                        ) : (
                          "revoked"
                        )}
                      </Badge>
                    </div>
                    <p className="break-all text-sm text-muted-foreground">{m.email ?? "—"}</p>
                    {m.roll_number || m.phone ? (
                      <p className="mono-tag text-muted-foreground">
                        {[m.roll_number, m.phone].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="secondary" disabled={reset.isPending}>
                          {reset.isPending && reset.variables?.id === m.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Share2 className="size-4" />
                          )}
                          Share login
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Send {name} a new login?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Passwords can't be looked up, so this generates a fresh one and their
                            old password stops working. You'll get a ready-made message to send over
                            WhatsApp or email.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              reset.mutate({ id: m.id, name, email: m.email, phone: m.phone })
                            }
                          >
                            <KeyRound className="size-4" />
                            Reset &amp; share
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      size="sm"
                      variant={approved ? "ghost" : "secondary"}
                      className={approved ? "text-destructive hover:text-destructive" : ""}
                      onClick={() =>
                        mutate.mutate({ userId: m.id, status: approved ? "rejected" : "approved" })
                      }
                      disabled={mutate.isPending}
                    >
                      {approved ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                      {approved ? "Revoke" : "Restore"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
