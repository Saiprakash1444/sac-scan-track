import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getExportRows } from "@/lib/admin.functions";
import { downloadCsv } from "@/lib/csv";

type Kind = "inventory" | "requests" | "loans";

const SHEETS: { kind: Kind; title: string; body: string }[] = [
  {
    kind: "inventory",
    title: "Inventory list",
    body: "Every part with its section, bin, total, available and out on loan.",
  },
  {
    kind: "requests",
    title: "Requirement list",
    body: "Everything members asked the club to buy, with links, prices, estimated totals and status.",
  },
  {
    kind: "loans",
    title: "Borrowing log",
    body: "Who borrowed what, for which project, when it was due and whether it came back.",
  },
];

export function DownloadsPanel() {
  const fetchRows = useServerFn(getExportRows);

  const download = useMutation({
    mutationFn: async (kind: Kind) => {
      const rows = await fetchRows({ data: { kind } });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`rmi-${kind}-${stamp}.csv`, rows as Record<string, string | number>[]);
      return rows.length;
    },
    onSuccess: (count) => toast.success(`Downloaded ${count} rows`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Download failed"),
  });

  return (
    <div className="space-y-4">
      <ul className="grid gap-2 md:grid-cols-3">
        {SHEETS.map((s) => (
          <li key={s.kind} className="panel flex flex-col gap-3 p-4">
            <div className="flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
            <Button
              variant="secondary"
              disabled={download.isPending}
              onClick={() => download.mutate(s.kind)}
            >
              {download.isPending && download.variables === s.kind ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Files are CSV: double-click to open in Excel, or in Google Sheets use File → Import →
        Upload.
      </p>
    </div>
  );
}
