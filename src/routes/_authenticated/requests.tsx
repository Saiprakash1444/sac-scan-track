import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createPartRequest, type PartRequestStatus } from "@/lib/inventory.functions";
import { formatDate, myRequestsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/requests")({
  validateSearch: z.object({ name: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Request a part | RMI Inventory" },
      {
        name: "description",
        content: "Ask the RMI admins to buy a part the club room doesn't have.",
      },
    ],
  }),
  component: RequestsPage,
});

const STATUS_LABEL: Record<PartRequestStatus, string> = {
  pending: "Waiting for admin",
  approved: "Approved",
  rejected: "Not approved",
  ordered: "Ordered",
  received: "In the room",
};

const STATUS_CLASS: Record<PartRequestStatus, string> = {
  pending: "text-warning",
  approved: "text-primary",
  rejected: "",
  ordered: "text-accent",
  received: "text-success",
};

function RequestsPage() {
  const { name: prefill } = Route.useSearch();
  const requests = useQuery(myRequestsQuery());
  const queryClient = useQueryClient();
  const create = useServerFn(createPartRequest);

  const empty = { name: prefill ?? "", quantity: "1", reason: "", link: "", price: "" };
  const [form, setForm] = useState(empty);

  const quantityOk = /^\d+$/.test(form.quantity.trim()) && Number(form.quantity) >= 1;
  const priceOk = !form.price.trim() || /^\d+(\.\d{1,2})?$/.test(form.price.trim());
  const linkOk = !form.link.trim() || /^https?:\/\//i.test(form.link.trim());

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: form.name,
          quantity: Number(form.quantity),
          reason: form.reason,
          link: form.link.trim() || undefined,
          estPrice: form.price.trim() ? Number(form.price) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Request sent to the admins");
      setForm({ ...empty, name: "" });
      queryClient.invalidateQueries({ queryKey: ["my-requests"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send"),
  });

  return (
    <AppShell
      title="Request a part"
      subtitle="Need something the room doesn't have, or more of it? Ask the admins to source it."
    >
      <div className="space-y-8">
        <form
          className="panel space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="req-name">What do you need?</Label>
              <Input
                id="req-name"
                placeholder="e.g. MG996R servo"
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-qty">Quantity</Label>
              <Input
                id="req-qty"
                inputMode="numeric"
                value={form.quantity}
                aria-invalid={!quantityOk}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req-reason">Why / which project?</Label>
            <Textarea
              id="req-reason"
              rows={2}
              maxLength={500}
              placeholder="Helps the admins decide — e.g. needed for the line follower drive"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="req-link">Link (optional)</Label>
              <Input
                id="req-link"
                type="url"
                placeholder="https://robu.in/…"
                value={form.link}
                aria-invalid={!linkOk}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-price">Price each ₹ (optional)</Label>
              <Input
                id="req-price"
                inputMode="decimal"
                placeholder="450"
                value={form.price}
                aria-invalid={!priceOk}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || !form.name.trim() || !quantityOk || !priceOk || !linkOk}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send request
          </Button>
        </form>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your requests
          </h2>
          {requests.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (requests.data ?? []).length === 0 ? (
            <p className="panel p-4 text-sm text-muted-foreground">
              You haven't requested anything yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {(requests.data ?? []).map((r) => (
                <li key={r.id} className="panel p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.quantity} × {r.name}
                    </span>
                    <Badge
                      variant={r.status === "rejected" ? "destructive" : "outline"}
                      className={STATUS_CLASS[r.status]}
                    >
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{formatDate(r.created_at)}</span>
                    {r.est_price != null ? <span>· ₹{r.est_price} each</span> : null}
                    {r.link ? (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        · link <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </p>
                  {r.admin_note ? (
                    <p className="mt-1 text-xs text-muted-foreground">Admin: {r.admin_note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
