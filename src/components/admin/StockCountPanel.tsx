import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getCounting, saveCountingMode } from "@/lib/admin.functions";

const countingKey = ["admin-counting"] as const;

/** Admin switch for member stock-takes, with progress so you know when to lock it. */
export function StockCountPanel({ onShowPending }: { onShowPending: () => void }) {
  const fetchCounting = useServerFn(getCounting);
  const doSave = useServerFn(saveCountingMode);
  const queryClient = useQueryClient();

  const counting = useQuery({ queryKey: countingKey, queryFn: () => fetchCounting() });

  const setMode = useMutation({
    mutationFn: (mode: "open" | "locked") => doSave({ data: { mode } }),
    onSuccess: ({ mode }) => {
      toast.success(
        mode === "open"
          ? "Counting is open — members can now enter shelf counts"
          : "Counting locked — only admins can change counts now",
      );
      queryClient.invalidateQueries({ queryKey: countingKey });
      queryClient.invalidateQueries({ queryKey: ["counting-mode"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  if (counting.isLoading) return <Skeleton className="h-24 w-full" />;
  if (counting.isError) {
    return (
      <p className="panel p-4 text-sm text-warning">
        Stock counting isn't set up yet — run the migration
        <span className="mono-tag"> 20261015160000_stock_counting </span>
        in the Supabase SQL editor.
      </p>
    );
  }

  const { mode, total, pending } = counting.data!;
  const done = total - pending;
  const pct = total ? Math.round((done / total) * 100) : 100;

  return (
    <section className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <ClipboardCheck className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Stock count</p>
          <p className="text-sm text-muted-foreground">
            {mode === "open"
              ? "Members can enter shelf counts from Browse → a section. Lock it when counting is done."
              : "Only admins can change counts. Open it to let members count rack by rack."}
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <span className={mode === "locked" ? "font-medium" : "text-muted-foreground"}>
            Locked
          </span>
          <Switch
            checked={mode === "open"}
            disabled={setMode.isPending}
            onCheckedChange={(open) => setMode.mutate(open ? "open" : "locked")}
            aria-label="Let members update counts"
          />
          <span className={mode === "open" ? "font-medium" : "text-muted-foreground"}>Open</span>
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {done} of {total} parts counted ({pct}%)
          </span>
          {pending > 0 ? (
            <button onClick={onShowPending} className="text-primary hover:underline">
              Show the {pending} still pending
            </button>
          ) : (
            <span className="text-success">Everything counted</span>
          )}
        </p>
      </div>
    </section>
  );
}
