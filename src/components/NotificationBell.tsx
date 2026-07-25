import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsRead } from "@/lib/inventory.functions";
import { formatDateTime, notificationsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const notifications = useQuery(notificationsQuery());
  const queryClient = useQueryClient();
  const markRead = useServerFn(markNotificationsRead);

  const mutation = useMutation({
    mutationFn: () => markRead({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const rows = notifications.data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && unread > 0) mutation.mutate();
      }}
    >
      <PopoverTrigger
        aria-label={unread > 0 ? `${unread} unread reminders` : "Reminders"}
        className="relative rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="font-display text-sm font-semibold">Return reminders</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No reminders yet. We'll ping you a day before anything is due.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {rows.slice(0, 20).map((n) => (
              <li
                key={n.id}
                className={cn("px-3 py-2.5", !n.read_at && "bg-secondary/40")}
              >
                <p
                  className={cn(
                    "text-sm font-medium",
                    n.kind === "overdue" && "text-destructive",
                  )}
                >
                  {n.title}
                </p>
                {n.body ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                ) : null}
                <p className="mono-tag mt-1 text-muted-foreground">
                  {formatDateTime(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
