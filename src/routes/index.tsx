import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Boxes, ClipboardList, MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RMI Inventory — NIT Trichy" },
      {
        name: "description",
        content:
          "Component inventory for the RMI club room at NIT Trichy: what we have, where it lives, and who has borrowed it.",
      },
      { property: "og:title", content: "RMI Inventory — NIT Trichy" },
      {
        property: "og:description",
        content: "What the RMI club room has, where it lives, and who has borrowed it.",
      },
    ],
  }),
  component: Landing,
});

const POINTS = [
  { icon: Boxes, text: "Every part counted and catalogued" },
  { icon: MapPin, text: "Exact section and bin for each one" },
  { icon: ClipboardList, text: "A clear record of who borrowed what" },
];

function Landing() {
  const navigate = useNavigate();

  // Members land straight in the app; this page is only for people signed out.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  return (
    <div className="grid-backdrop flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-12 text-center">
        <img
          src="/brand/rmi-logo.png"
          alt="RMI — Robotics and Machine Intelligence"
          className="w-60"
        />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">RMI Inventory</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The component store for the RMI club room, NIT Trichy.
        </p>

        <ul className="mt-8 w-full space-y-2 text-left">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="panel flex items-center gap-3 px-4 py-3 text-sm">
              <Icon className="size-4 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>

        <Button asChild size="lg" className="mt-8 w-full">
          <Link to="/auth">Member sign in</Link>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Accounts are issued by club coordinators.
        </p>
      </main>

      <footer className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        Robotics and Machine Intelligence, NIT Trichy ·{" "}
        <Link to="/admin" className="underline hover:text-foreground">
          Admin panel
        </Link>
      </footer>
    </div>
  );
}
