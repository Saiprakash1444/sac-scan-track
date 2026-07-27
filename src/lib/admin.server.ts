import { createHash, timingSafeEqual } from "node:crypto";
import { useSession } from "@tanstack/react-start/server";

export type AdminSession = { unlocked?: boolean };

export function adminSessionConfig() {
  return {
    password: process.env.ADMIN_SESSION_SECRET!,
    name: "sac-admin",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function isAdminUnlocked(): Promise<boolean> {
  const session = await useSession<AdminSession>(adminSessionConfig());
  return session.data.unlocked === true;
}

export type AdminLoan = {
  id: string;
  component_name: string;
  rack_code: string | null;
  bin_label: string | null;
  member_name: string;
  member_email: string | null;
  quantity: number;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  extended_count: number;
  damage_reported: boolean;
  damage_note: string | null;
};

export type AdminOverview = {
  loans: AdminLoan[];
  lowStock: { id: string; name: string; rack_code: string | null; available: number; total: number }[];
  generatedAt: string;
};

type RawRow = {
  id: string;
  user_id: string;
  quantity: number;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  extended_count: number;
  damage_reported: boolean;
  damage_note: string | null;
  components: { name: string; bin_label: string | null; racks: { code: string } | null } | null;
};

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [loansRes, componentsRes, profilesRes] = await Promise.all([
    supabaseAdmin
      .from("borrow_records")
      .select(
        "id, user_id, quantity, borrowed_at, due_at, returned_at, extended_count, damage_reported, damage_note, components(name, bin_label, racks(code))",
      )
      .order("borrowed_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("components")
      .select("id, name, quantity_available, quantity_total, borrowable, racks(code)")
      .order("name"),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
  ]);

  if (loansRes.error) throw new Error(loansRes.error.message);
  if (componentsRes.error) throw new Error(componentsRes.error.message);

  const profiles = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, { name: p.full_name || p.email || "Member", email: p.email }]),
  );

  const loans = ((loansRes.data ?? []) as unknown as RawRow[]).map<AdminLoan>((r) => ({
    id: r.id,
    component_name: r.components?.name ?? "Unknown component",
    rack_code: r.components?.racks?.code ?? null,
    bin_label: r.components?.bin_label ?? null,
    member_name: profiles.get(r.user_id)?.name ?? "Member",
    member_email: profiles.get(r.user_id)?.email ?? null,
    quantity: r.quantity,
    borrowed_at: r.borrowed_at,
    due_at: r.due_at,
    returned_at: r.returned_at,
    extended_count: r.extended_count,
    damage_reported: r.damage_reported,
    damage_note: r.damage_note,
  }));

  const lowStock = (componentsRes.data ?? [])
    .filter(
      (c) =>
        c.borrowable &&
        c.quantity_available <= Math.max(1, Math.floor((c.quantity_total ?? 1) * 0.25)),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      rack_code: (c as unknown as { racks: { code: string } | null }).racks?.code ?? null,
      available: c.quantity_available,
      total: c.quantity_total,
    }));

  return { loans, lowStock, generatedAt: new Date().toISOString() };
}

export async function adminForceReturn(recordId: string, damaged: boolean, note: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rec, error } = await supabaseAdmin
    .from("borrow_records")
    .select("id, component_id, quantity, returned_at")
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) throw new Error("Record not found");
  if (rec.returned_at) return { ok: true };

  const { error: updateError } = await supabaseAdmin
    .from("borrow_records")
    .update({
      returned_at: new Date().toISOString(),
      damage_reported: damaged,
      damage_note: note?.trim() ? note.trim() : null,
    })
    .eq("id", recordId);
  if (updateError) throw new Error(updateError.message);

  const { data: comp } = await supabaseAdmin
    .from("components")
    .select("quantity_available, quantity_total")
    .eq("id", rec.component_id)
    .maybeSingle();

  if (comp) {
    if (damaged) {
      await supabaseAdmin
        .from("components")
        .update({ quantity_total: Math.max(0, comp.quantity_total - rec.quantity) })
        .eq("id", rec.component_id);
    } else {
      await supabaseAdmin
        .from("components")
        .update({
          quantity_available: Math.min(comp.quantity_total, comp.quantity_available + rec.quantity),
        })
        .eq("id", rec.component_id);
    }
  }

  return { ok: true };
}

export async function runReminderSweep(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("generate_return_reminders");
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/* ---------------------------------------------------------------- members */

export type AdminMember = {
  id: string;
  full_name: string;
  email: string | null;
  roll_number: string | null;
  phone: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
};

export async function fetchMembers(): Promise<AdminMember[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, roll_number, phone, approval_status, created_at, approved_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminMember[];
}

export async function setMemberApproval(
  userId: string,
  status: "approved" | "rejected" | "pending",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      approval_status: status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: status === "pending" ? null : "admin-panel",
    } as never)
    .eq("id", userId);
  if (error) throw new Error(error.message);

  if (status !== "pending") {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      kind: status === "approved" ? "approved" : "rejected",
      title: status === "approved" ? "You're approved" : "Access request declined",
      body:
        status === "approved"
          ? "An admin approved your SAC account — you can borrow components now."
          : "An admin declined your access request. Talk to a club coordinator.",
    });
  }
  return { ok: true };
}

/* -------------------------------------------------------------- inventory */

export type ComponentInput = {
  name: string;
  category: string;
  specs: string | null;
  quantity_total: number;
  quantity_available: number;
  rack_id: string | null;
  bin_label: string | null;
  qr_code: string | null;
  keywords: string[];
  borrowable: boolean;
};

export async function upsertComponent(id: string | null, input: ComponentInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row = { ...input, qr_code: input.qr_code ? input.qr_code.toUpperCase() : null };
  const { data, error } = id
    ? await supabaseAdmin.from("components").update(row).eq("id", id).select("id").maybeSingle()
    : await supabaseAdmin.from("components").insert(row).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return { id: data?.id ?? id };
}

export async function deleteComponent(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("borrow_records")
    .select("id", { count: "exact", head: true })
    .eq("component_id", id)
    .is("returned_at", null);
  if ((count ?? 0) > 0) throw new Error("Someone still has this part checked out");
  const { error } = await supabaseAdmin.from("components").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function upsertRack(
  id: string | null,
  input: { code: string; name: string; description: string | null; location_note: string | null },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row = { ...input, code: input.code.toUpperCase() };
  const { error } = id
    ? await supabaseAdmin.from("racks").update(row).eq("id", id)
    : await supabaseAdmin.from("racks").insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function fetchCatalogue() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [racks, components, unknowns] = await Promise.all([
    supabaseAdmin.from("racks").select("id, code, name, description, location_note").order("code"),
    supabaseAdmin
      .from("components")
      .select(
        "id, name, category, specs, quantity_total, quantity_available, rack_id, bin_label, qr_code, keywords, borrowable",
      )
      .order("name"),
    supabaseAdmin
      .from("unknown_scans")
      .select("id, guessed_name, guessed_category, notes, created_at, resolved_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (racks.error) throw new Error(racks.error.message);
  if (components.error) throw new Error(components.error.message);
  return {
    racks: racks.data ?? [],
    components: components.data ?? [],
    unknownScans: (unknowns.data ?? []) as {
      id: string;
      guessed_name: string;
      guessed_category: string | null;
      notes: string | null;
      created_at: string;
    }[],
  };
}

export async function dismissUnknownScan(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("unknown_scans")
    .update({ resolved_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
