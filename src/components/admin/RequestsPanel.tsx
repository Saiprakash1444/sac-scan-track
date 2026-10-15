import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPartRequests, updatePartRequest } from "@/lib/admin.functions";
import type { AdminPartRequest } from "@/lib/admin.server";
import { formatDate } from "@/lib/queries";

type Status = AdminPartRequest["status"];
type Next = Exclude<Status, "pending">;

const LABEL: Record<Status, string> = {
  pending: "New",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
};

/** What an admin can move a request to from each state. */
const NEXT: Record<Status, { to: Next; label: string; ghost?: boolean }[]> = {
  pending: [
    { to: "approved", label: "Approve" },
    { to: "rejected", label: "Reject", ghost: true },
  ],
  approved: [
    { to: "ordered", label: "Mark ordered" },
    { to: "rejected", label: "Reject", ghost: true },
  ],
  ordered: [{ to: "received", label: "Mark received" }],
  rejected: [{ to: "approved", label: "Approve after all", ghost: true }],
  received: [],
};

const FILTERS: { value: "open" | Status | "all"; label: string }[] = [
  { value: "open", label: "To do" },
  { value: "pending", label: "New" },
  { value: "approved", label: "Approved" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export function RequestsPanel() {
  const fetchRequests = useServerFn(getPartRequests);
  const doUpdate = useServerFn(updatePartRequest);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("open");

  const requests = useQuery({ queryKey: ["admin-requests"], queryFn: () => fetchRequests() });

  const update = useMutation({
    mutationFn: (input: { id: string; status: Next; note?: string }) => doUpdate({ data: input }),
    onSuccess: (_res, input) => {
      toast.success(`Marked ${LABEL[input.status].toLowerCase()} — the member was notified`);
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  if (requests.isLoading) return <Skeleton className="h-40 w-full" />;
  if (requests.isError) {
    return (
      <p className="panel p-4 text-sm text-warning">
        Requests aren't set up yet — run the migration
        <span className="mono-tag"> 20261015140000_borrow_purpose_and_part_requests </span>
        in the Supabase SQL editor.
      </p>
    );
  }

  const all = requests.data ?? [];
  const visible = all.filter((r) =>
    filter === "all"
      ? true
      : filter === "open"
        ? r.status === "pending" || r.status === "approved" || r.status === "ordered"
        : r.status === filter,
  );
  const approvedCost = all
    .filter((r) => r.status === "approved" && r.est_price != null)
    .reduce((sum, r) => sum + (r.est_price ?? 0) * r.quantity, 0);

  function move(r: AdminPartRequest, to: Next) {
    let note: string | undefined;
    if (to === "rejected") {
      const answer = prompt(`Why not get ${r.name}? (optional — the member sees this)`);
      if (answer === null) return;
      note = answer.trim() || undefined;
    }
    update.mutate({ id: r.id, status: to, note });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? all.length
              : f.value === "open"
                ? all.filter((r) => ["pending", "approved", "ordered"].includes(r.status)).length
                : all.filter((r) => r.status === f.value).length;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={
                filter === f.value
                  ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm text-primary"
                  : "rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {f.label} {count > 0 ? <span className="opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {approvedCost > 0 ? (
        <p className="text-sm text-muted-foreground">
          Approved, not yet ordered: about{" "}
          <span className="font-medium text-foreground">
            ₹{approvedCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>{" "}
          (where a price was given)
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="panel p-4 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li key={r.id} className="panel space-y-2 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {r.quantity} × {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.member_name} · {formatDate(r.created_at)}
                    {r.est_price != null
                      ? ` · ₹${r.est_price} each (≈ ₹${Math.round(r.est_price * r.quantity)})`
                      : ""}
                  </span>
                </span>
                <Badge
                  variant={r.status === "rejected" ? "destructive" : "outline"}
                  className={r.status === "pending" ? "text-warning" : undefined}
                >
                  {LABEL[r.status]}
                </Badge>
              </div>
              {r.reason ? <p className="text-sm">{r.reason}</p> : null}
              {r.link ? (
                <a
                  href={r.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="truncate">{r.link}</span>
                </a>
              ) : null}
              {r.admin_note ? (
                <p className="text-xs text-muted-foreground">Note: {r.admin_note}</p>
              ) : null}
              {NEXT[r.status].length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {NEXT[r.status].map((n) => (
                    <Button
                      key={n.to}
                      size="sm"
                      variant={n.ghost ? "ghost" : "default"}
                      disabled={update.isPending}
                      onClick={() => move(r, n.to)}
                    >
                      {n.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
