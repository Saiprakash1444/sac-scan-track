import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, ClipboardList, MapPin, QrCode, ScanLine } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SAC Robotics Inventory — scan, find, borrow" },
      {
        name: "description",
        content:
          "Camera-first inventory for the SAC robotics club room: scan a component to identify it, see its rack and bin, and log borrows to your name.",
      },
      { property: "og:title", content: "SAC Robotics Inventory — scan, find, borrow" },
      {
        property: "og:description",
        content:
          "Point your phone at a part, get its specs, stock and exact rack location, then borrow it in one tap.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Camera,
    title: "Point, don't type",
    body: "AI recognises the part from a photo and matches it against the club catalogue. Printed QR labels resolve instantly.",
  },
  {
    icon: MapPin,
    title: "Exact shelf, not a guess",
    body: "Every part maps to a rack and bin. Search a name to get its spot, or open a rack to list everything inside it.",
  },
  {
    icon: ClipboardList,
    title: "Borrowing on the record",
    body: "Checkouts log your account name, quantity and due date. Overdue items surface on your phone and the room dashboard.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="grid-backdrop min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <img src="/brand/rmi-cube.png" alt="RMI" className="size-9 rounded-lg" />
          <span className="font-display text-base font-bold">SAC Inventory</span>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={signedIn ? "/scan" : "/auth"}>{signedIn ? "Open app" : "Sign in"}</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">
        <section className="pt-8 md:pt-16">
          <p className="mono-tag text-primary">Robotics club · component store</p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Scan the part.
            <span className="block text-primary">Get its shelf, specs and stock.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
            The SAC room inventory as a phone-first app. No part numbers to type, no spreadsheet
            hunting — just a camera, the catalogue, and a clean record of who took what.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/scan" : "/auth"}>
                <ScanLine className="size-4" />
                {signedIn ? "Start scanning" : "Join the SAC room"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to={signedIn ? "/find" : "/auth"}>Browse racks</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Installable on Android, iPhone and lab laptops — add it to your home screen.
          </p>
        </section>

        <section className="mt-14 grid gap-3 md:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="panel p-5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2">
                  <Icon className="size-4 text-primary" />
                </span>
                <h2 className="mt-3 font-display text-base font-bold">{feature.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
              </article>
            );
          })}
        </section>

        <section className="panel mt-4 p-6">
          <h2 className="font-display text-lg font-bold">How a checkout runs</h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              { step: "01", text: "Scan the component with your phone camera." },
              { step: "02", text: "The app matches it — or you search by name." },
              { step: "03", text: "See specs, quantity free and its rack + bin." },
              { step: "04", text: "Borrow it; your name and due date are logged." },
            ].map((item) => (
              <li key={item.step}>
                <p className="mono-tag text-primary">{item.step}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <QrCode className="size-3.5 text-primary" />
            Bins of resistors, ICs and connectors resolve to the box, not the individual part.
          </p>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        SAC Robotics Club — component inventory ·{" "}
        <Link to="/admin" className="underline hover:text-foreground">
          Room admin panel
        </Link>
      </footer>

    </div>
  );
}
