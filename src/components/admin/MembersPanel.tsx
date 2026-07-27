import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, UserCheck, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminMembers, setMemberStatus } from "@/lib/admin.functions";
import { formatDate } from "@/lib/queries";

const membersKey = ["admin-members"] as const;

export function MembersPanel() {
  const fetchMembers = useServerFn(getAdminMembers);
  const setStatus = useServerFn(setMemberStatus);
  const queryClient = useQueryClient();

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

  if (members.isLoading) return <Skeleton className="h-48 w-full" />;

  const rows = members.data ?? [];
  const pending = rows.filter((m) => m.approval_status === "pending");
  const rest = rows.filter((m) => m.approval_status !== "pending");

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-warning">
          Access requests ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="panel p-4 text-sm text-muted-foreground">No one is waiting for approval.</p>
        ) : (
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
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Members ({rest.length})
        </h2>
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
      </section>
    </div>
  );
}
