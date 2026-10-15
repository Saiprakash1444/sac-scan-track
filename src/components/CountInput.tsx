import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateComponentCount, type Component } from "@/lib/inventory.functions";

/**
 * Inline stock-take field: "how many are on the shelf right now". Units out on
 * loan are added back server-side, so the member only counts what they see.
 */
export function CountInput({ component }: { component: Component }) {
  const out = Math.max(0, component.quantity_total - component.quantity_available);
  const [value, setValue] = useState(
    component.count_pending ? "" : String(component.quantity_available),
  );
  const save = useServerFn(updateComponentCount);
  const queryClient = useQueryClient();
  const valid = /^\d+$/.test(value.trim());

  const mutation = useMutation({
    mutationFn: () => save({ data: { componentId: component.id, onShelf: Number(value) } }),
    onSuccess: (result) => {
      toast.success(
        `${component.name}: ${result.available} on the shelf${result.out ? `, ${result.out} out on loan` : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mutation.mutate();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        inputMode="numeric"
        aria-label={`How many ${component.name} are on the shelf`}
        placeholder="On shelf"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-20 text-sm"
      />
      <Button
        type="submit"
        size="sm"
        variant={component.count_pending ? "default" : "secondary"}
        className="h-8"
        disabled={!valid || mutation.isPending}
        aria-label="Save count"
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
      </Button>
      {out > 0 ? <span className="text-xs text-muted-foreground">+{out} out</span> : null}
    </form>
  );
}
