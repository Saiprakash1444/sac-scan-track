import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, UserCheck, UserPlus, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
type IssuedCredential = { name: string; email: string; password: string };

function CredentialCard({ issued, onDone }: { issued: IssuedCredential; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const message = `RMI Inventory login\nEmail: ${issued.email}\nPassword: ${issued.password}\nSign in at ${typeof window === "undefined" ? "" : window.location.origin}/auth`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the text and copy it by hand.");
    }
  }

  return (
    <div className="panel space-y-3 border-warning/50 p-4">
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Password for {issued.name}</p>
          <p className="text-sm text-muted-foreground">
            Shown once. Copy it now and hand it over — it cannot be looked up again, only
            reset.
          </p>
        </div>
      </div>

      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm">
        {message}
      </pre>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
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
      setIssued({ name: fullName, email, password: result.password });
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
    mutationFn: (member: { id: string; name: string; email: string | null }) =>
      resetPassword({ data: { userId: member.id } }).then((result) => ({ member, result })),
    onSuccess: ({ member, result }) => {
      setIssued({
        name: member.name,
        email: member.email ?? "",
        password: result.password,
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not reset the password"),
  });

  if (members.isLoading) return <Skeleton className="h-48 w-full" />;

  const rows = members.data ?? [];
  // Self-signup is gone, so `pending` only ever holds accounts created before the
  // switch. The section stays so those are not stranded.
  const pending = rows.filter((m) => m.approval_status === "pending");
  const rest = rows.filter((m) => m.approval_status !== "pending");

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

        {issued ? <CredentialCard issued={issued} onDone={() => setIssued(null)} /> : null}

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
                <Input
                  id="member-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The account is approved immediately and a first password is generated for you
              to pass on.
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
              <li key={m.id} className="panel flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.full_name || "Unnamed"}</span>
                  <span className="text-sm text-muted-foreground">{m.email ?? "—"}</span>
                  <span className="mono-tag mt-0.5 block text-muted-foreground">
                    {m.roll_number ? `${m.roll_number} · ` : ""}requested {formatDate(m.created_at)}
                  </span>
                </span>
                <Button
                  size="sm"
                  onClick={() => mutate.mutate({ userId: m.id, status: "approved" })}
                  disabled={mutate.isPending}
                >
                  {mutate.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserCheck className="size-4" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => mutate.mutate({ userId: m.id, status: "rejected" })}
                  disabled={mutate.isPending}
                >
                  <UserX className="size-4" />
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Members ({rest.length})
        </h2>
        {rest.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">
            No members yet. Use <span className="font-medium">New member</span> above to create
            the first account.
          </p>
        ) : (
          <ul className="space-y-2">
            {rest.map((m) => (
              <li key={m.id} className="panel flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.full_name || "Unnamed"}</span>
                  <span className="text-sm text-muted-foreground">{m.email ?? "—"}</span>
                </span>
                <Badge variant={m.approval_status === "approved" ? "secondary" : "destructive"}>
                  {m.approval_status === "approved" ? (
                    <>
                      <Check className="size-3" /> approved
                    </>
                  ) : (
                    "declined"
                  )}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    reset.mutate({
                      id: m.id,
                      name: m.full_name || "this member",
                      email: m.email,
                    })
                  }
                  disabled={reset.isPending}
                >
                  {reset.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  Reset password
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    mutate.mutate({
                      userId: m.id,
                      status: m.approval_status === "approved" ? "rejected" : "approved",
                    })
                  }
                  disabled={mutate.isPending}
                >
                  {m.approval_status === "approved" ? "Revoke" : "Approve"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
