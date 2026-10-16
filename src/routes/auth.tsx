import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAccount } from "@/lib/signup.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    mode: z.enum(["signin", "request"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in | RMI Inventory" },
      {
        name: "description",
        content:
          "Sign in to RMI Inventory to find parts, check stock and borrow from the club room.",
      },
      { property: "og:title", content: "Sign in | RMI Inventory" },
      {
        property: "og:description",
        content: "Member access to the RMI club component inventory.",
      },
    ],
  }),
  component: AuthPage,
});

function safePath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}

function AuthPage() {
  const { redirect, mode = "signin" } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const destination = safePath(redirect);
  const setMode = (next: "signin" | "request") =>
    navigate({ to: "/auth", search: { redirect, mode: next }, replace: true });

  if (mode === "request") {
    return (
      <AuthCard>
        <RequestAccountForm
          onBack={() => setMode("signin")}
          onCreated={() => navigate({ to: destination, replace: true })}
        />
      </AuthCard>
    );
  }

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
    <AuthCard>
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
        New to RMI?{" "}
        <button
          type="button"
          onClick={() => setMode("request")}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Request an account
        </button>{" "}
        — an admin approves it first.
      </p>
    </AuthCard>
  );
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-sm p-6">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/rmi-cube.png" alt="RMI" className="size-9 rounded-lg" />
          <span className="font-display text-base font-bold">RMI Inventory</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

function RequestAccountForm({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const submit = useServerFn(requestAccount);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    rollNumber: "",
    phone: "",
    password: "",
    confirm: "",
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirm) return;
    setBusy(true);
    try {
      await submit({
        data: {
          fullName: form.fullName,
          email: form.email,
          rollNumber: form.rollNumber.trim() || null,
          phone: form.phone.trim() || null,
          password: form.password,
          website: form.website,
        },
      });
      // Sign straight in: AppShell shows the "waiting for approval" screen and
      // flips to the app as soon as an admin approves.
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      toast.success("Request sent", {
        description: "You'll get in as soon as an admin approves it.",
      });
      if (error) onBack();
      else onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mt-6 text-xl font-bold">Request an account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        An admin checks every request. You can use the app once it's approved.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="req-name">Full name</Label>
          <Input
            id="req-name"
            autoComplete="name"
            value={form.fullName}
            onChange={set("fullName")}
            minLength={2}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-email">Email</Label>
          <Input
            id="req-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="req-roll">Roll no.</Label>
            <Input id="req-roll" value={form.rollNumber} onChange={set("rollNumber")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-phone">Phone</Label>
            <Input
              id="req-phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set("phone")}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-password">Password (8+ characters)</Label>
          <Input
            id="req-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            minLength={8}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-confirm">Confirm password</Label>
          <Input
            id="req-confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set("confirm")}
            aria-invalid={mismatch}
            required
          />
          {mismatch ? <p className="text-xs text-destructive">Passwords don't match.</p> : null}
        </div>
        {/* Honeypot: off-screen for people, tempting for bots. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={set("website")}
          className="absolute -left-[9999px] size-px opacity-0"
          aria-hidden="true"
        />
        <Button type="submit" className="w-full" disabled={busy || mismatch}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Send request
        </Button>
      </form>

      <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onBack}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </button>
      </p>
    </>
  );
}
