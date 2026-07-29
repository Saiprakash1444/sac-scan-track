import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, PackageCheck, Loader2 } from "lucide-react";

import { borrowComponent, type Component, type Rack } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function StockBadge({ component }: { component: Component }) {
  const { quantity_available: avail, quantity_total: total } = component;
  if (!component.borrowable) {
    return <Badge variant="secondary">Room use only</Badge>;
  }
  if (component.category === "mech") {
    return (
      <Badge variant="outline" className="text-accent">
        In the box
      </Badge>
    );
  }
  if (avail === 0) {
    return <Badge variant="destructive">All out</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className={avail / Math.max(total, 1) < 0.34 ? "text-warning" : "text-accent"}
    >
      {avail} of {total} free
    </Badge>
  );
}


export function LocationLine({ component, rack }: { component: Component; rack?: Rack }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <MapPin className="size-3.5 text-primary" />
      <span className="font-medium text-foreground">{rack?.code ?? "Unassigned"}</span>
      {rack ? <span>· {rack.name.replace(/^Rack \d+ - /, "")}</span> : null}
      {component.bin_label ? <span className="mono-tag">bin {component.bin_label}</span> : null}
    </p>
  );
}

export function ComponentDetail({
  component,
  rack,
  onDone,
}: {
  component: Component;
  rack?: Rack;
  onDone?: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [days, setDays] = useState(7);
  const queryClient = useQueryClient();
  const borrow = useServerFn(borrowComponent);

  const mutation = useMutation({
    mutationFn: () => borrow({ data: { componentId: component.id, quantity, days } }),
    onSuccess: () => {
      toast.success(`${quantity} × ${component.name} logged to your name`);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["borrows"] });
      onDone?.();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not borrow"),
  });

  const maxQty = Math.max(1, component.quantity_available);

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold leading-tight">{component.name}</h2>
          <p className="mono-tag mt-1 text-muted-foreground">{component.category}</p>
        </div>
        <StockBadge component={component} />
      </div>

      {component.specs ? <p className="mt-3 text-sm">{component.specs}</p> : null}

      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
        <p className="mono-tag text-muted-foreground">Where to find it</p>
        <div className="mt-1.5">
          <LocationLine component={component} rack={rack} />
          {rack?.location_note ? (
            <p className="mt-1 text-xs text-muted-foreground">{rack.location_note}</p>
          ) : null}
        </div>
      </div>

      {component.borrowable ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, +e.target.value || 1)))}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="days">Return in (days)</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Math.min(90, Math.max(1, +e.target.value || 1)))}
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || component.quantity_available === 0}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            {component.quantity_available === 0 ? "Out of stock" : "Borrow in my name"}
          </Button>
        </form>
      ) : (
        <p className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
          This is a shared bin box — take what you need inside the room, no checkout needed.
        </p>
      )}
    </div>
  );
}
