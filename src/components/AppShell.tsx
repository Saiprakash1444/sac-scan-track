import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Home,
  Hourglass,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Search,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";
import type { ReactNode } from "react";

import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type NavTo = "/home" | "/find" | "/requests" | "/my-items" | "/dashboard";
const NAV: { to: NavTo; label: string; icon: typeof Home; adminOnly?: boolean }[] = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/find", label: "Browse", icon: Search },
  { to: "/requests", label: "Requests", icon: ShoppingCart },
  { to: "/my-items", label: "My items", icon: ClipboardList },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
];

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Optional button shown beside the page title. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const me = useQuery(meQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter((item) => !item.adminOnly || me.data?.isAdmin);
  const displayName = me.data?.profile?.full_name || "Member";
  const status = me.data?.approvalStatus;
  const gated = me.isSuccess && status !== "approved";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/home" className="flex items-center gap-2.5">
            <img src="/brand/rmi-cube.png" alt="RMI" className="size-8 rounded-lg" />
            <span className="leading-tight">
              <span className="block font-display text-sm font-semibold tracking-tight">
                RMI Inventory
              </span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                NIT Trichy
              </span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {gated
              ? null
              : items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                      pathname === item.to && "bg-secondary text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <span className="hidden text-right text-xs leading-tight text-muted-foreground sm:block">
              {displayName}
              {me.data?.isAdmin ? <span className="block text-primary">Admin</span> : null}
            </span>
            {gated ? null : <NotificationBell />}
            {me.data?.profile?.email ? (
              <ChangePasswordDialog
                email={me.data.profile.email}
                trigger={
                  <button
                    aria-label="Change password"
                    title="Change password"
                    className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <KeyRound className="size-4" />
                  </button>
                }
              />
            ) : null}
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {gated ? (
        <main className="mx-auto max-w-lg px-4 py-16">
          <div className="panel space-y-4 p-6 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-secondary">
              {status === "rejected" ? (
                <ShieldAlert className="size-6 text-destructive" />
              ) : (
                <Hourglass className="size-6 text-warning" />
              )}
            </span>
            <h1 className="font-display text-xl font-bold">
              {status === "rejected" ? "Access turned off" : "Waiting for admin approval"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {status === "rejected"
                ? "Your access to RMI Inventory has been turned off. Speak to a club coordinator if you think this is a mistake."
                : "Your request has reached the admins. You can look around once it's approved — nudge a club coordinator if it's urgent, then tap Check again."}
            </p>
            <p className="mono-tag text-muted-foreground">{me.data?.profile?.email ?? ""}</p>
            <button onClick={() => me.refetch()} className="text-xs text-primary underline">
              Check again
            </button>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:pb-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {action}
          </div>
          <div className="mt-5">{children}</div>
        </main>
      )}

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden",
          gated && "hidden",
        )}
      >
        <div className="mx-auto flex max-w-md">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
