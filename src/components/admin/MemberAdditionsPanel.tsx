import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { decideSubmission, getAdditions, saveAdditionsMode } from "@/lib/admin.functions";
import { formatDateTime } from "@/lib/queries";

const additionsKey = ["admin-additions"] as const;

export function MemberAdditionsPanel({
  sections,
  onCatalogueChanged,
}: {
  sections: { id: string; code: string }[];
  onCatalogueChanged: () => void;
}) {
  const fetchAdditions = useServerFn(getAdditions);
  const doSaveMode = useServerFn(saveAdditionsMode);
  const doDecide = useServerFn(decideSubmission);
  const queryClient = useQueryClient();

  const additions = useQuery({ queryKey: additionsKey, queryFn: () => fetchAdditions() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: additionsKey });

  const setMode = useMutation({
    mutationFn: (mode: "direct" | "approval") => doSaveMode({ data: { mode } }),
    onSuccess: ({ mode }) => {
      toast.success(
        mode === "approval"
          ? "Member additions now wait for approval"
          : "Member additions now go straight into the catalogue",
      );
      refresh();
      queryClient.invalidateQueries({ queryKey: ["additions-mode"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; approve: boolean; note?: string }) =>
      doDecide({ data: input }),
    onSuccess: (_res, input) => {
      toast.success(input.approve ? "Added to the catalogue" : "Rejected");
      refresh();
      if (input.approve) onCatalogueChanged();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  if (additions.isLoading) return <Skeleton className="h-28 w-full" />;

  if (additions.isError) {
    return (
      <section className="panel border-warning/50 p-4 text-sm">
        <p className="font-medium text-warning">Member additions aren't set up yet</p>
        <p className="mt-1 text-muted-foreground">
          Run the migration{" "}
          <span className="mono-tag">20261015120000_member_component_submissions</span> in the
          Supabase SQL editor, then reload this page.
        </p>
      </section>
    );
  }

  const mode = additions.data?.mode ?? "approval";
  const pending = additions.data?.pending ?? [];
  const sectionCode = (id: string | null) => sections.find((s) => s.id === id)?.code ?? null;

  return (
    <section className="space-y-3">
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <UserPlus className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Member additions</p>
          <p className="text-sm text-muted-foreground">
            {mode === "approval"
              ? "Parts members add wait here until an admin approves them."
              : "Parts members add go straight into the catalogue, logged under their name."}
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span className={mode === "approval" ? "font-medium" : "text-muted-foreground"}>
            Needs approval
          </span>
          <Switch
            checked={mode === "direct"}
            disabled={setMode.isPending}
            onCheckedChange={(direct) => setMode.mutate(direct ? "direct" : "approval")}
            aria-label="Let members add parts directly"
          />
          <span className={mode === "direct" ? "font-medium" : "text-muted-foreground"}>
            Add directly
          </span>
        </label>
      </div>

      {pending.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-warning">
            Waiting for approval ({pending.length})
          </h2>
          <ul className="space-y-2">
            {pending.map((s) => {
              const code = sectionCode(s.rack_id);
              return (
                <li key={s.id} className="panel flex flex-wrap items-center gap-3 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {s.quantity} × {s.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {code ? `${code}` : "no section"}
                      {s.bin_label ? ` · bin ${s.bin_label}` : ""} · {s.category} · by{" "}
                      {s.member_name}, {formatDateTime(s.created_at)}
                    </span>
                    {s.specs ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.specs}
                      </span>
                    ) : null}
                    {s.note ? (
                      <span className="mt-1 block text-xs italic text-muted-foreground">
                        “{s.note}”
                      </span>
                    ) : null}
                  </span>
                  {!code ? <Badge variant="outline">pick a section after</Badge> : null}
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: s.id, approve: true })}
                  >
                    <Check className="size-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decide.isPending}
                    onClick={() => {
                      const note = prompt(
                        `Why not add ${s.name}? (optional, the member sees this)`,
                      );
                      if (note === null) return;
                      decide.mutate({ id: s.id, approve: false, note: note.trim() || undefined });
                    }}
                  >
                    <X className="size-4 text-destructive" />
                    Reject
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
