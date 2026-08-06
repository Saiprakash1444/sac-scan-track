import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Loader2 } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in | SAC Robotics Inventory" },
      {
        name: "description",
        content:
          "Sign in to the SAC robotics club inventory to scan components, check stock and borrow parts.",
      },
      { property: "og:title", content: "Sign in | SAC Robotics Inventory" },
      {
        property: "og:description",
        content: "Member access to the SAC robotics club component inventory.",
      },
    ],
  }),
  component: AuthPage,
});

function safePath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/scan";
  return value;
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const destination = safePath(redirect);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: destination, replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-sm p-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-signal">
            <Boxes className="size-5 text-primary-foreground" />
          </span>
          <span className="font-display text-base font-bold">SAC Inventory</span>
        </Link>

        <h1 className="mt-6 text-xl font-bold">Member sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your name is logged against every component you borrow.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>

        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          Accounts are created by the club admin — there is no public sign-up. Ask a
          coordinator to add you, and they will hand you your first password.
        </p>
      </div>
    </div>
  );
}
