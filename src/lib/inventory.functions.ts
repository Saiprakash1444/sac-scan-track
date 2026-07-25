import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Rack = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  location_note: string | null;
};

export type Component = {
  id: string;
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

export type BorrowRow = {
  id: string;
  component_id: string;
  user_id: string;
  quantity: number;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  note: string | null;
  extended_count: number;
  damage_reported: boolean;
  damage_note: string | null;
  component_name: string;
  bin_label: string | null;
  rack_code: string | null;
  member_name: string;
};

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};


const uuid = z.string().uuid();

/** Whole catalogue: racks + components. Small enough to ship in one payload. */
export const getInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [racksRes, componentsRes] = await Promise.all([
      context.supabase
        .from("racks")
        .select("id, code, name, description, location_note")
        .order("code"),
      context.supabase
        .from("components")
        .select(
          "id, name, category, specs, quantity_total, quantity_available, rack_id, bin_label, qr_code, keywords, borrowable",
        )
        .order("name"),
    ]);

    if (racksRes.error) throw new Error(racksRes.error.message);
    if (componentsRes.error) throw new Error(componentsRes.error.message);

    return {
      racks: (racksRes.data ?? []) as Rack[],
      components: (componentsRes.data ?? []) as Component[],
    };
  });

/** Current member: profile + admin flag. */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profileRes, adminRes] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, full_name, email, roll_number, phone")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);

    return {
      userId: context.userId,
      profile: profileRes.data ?? null,
      isAdmin: adminRes.data === true,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(1).max(80),
        roll_number: z.string().trim().max(40).optional().nullable(),
        phone: z.string().trim().max(20).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        full_name: data.full_name,
        roll_number: data.roll_number || null,
        phone: data.phone || null,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const borrowComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        componentId: uuid,
        quantity: z.number().int().min(1).max(100),
        days: z.number().int().min(1).max(90),
        note: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: recordId, error } = await context.supabase.rpc("borrow_component", {
      _component_id: data.componentId,
      _quantity: data.quantity,
      _days: data.days,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { recordId };
  });

export const returnComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        recordId: uuid,
        damaged: z.boolean().default(false),
        damageNote: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("return_component", {
      _record_id: data.recordId,
      _damaged: data.damaged,
      _damage_note: data.damageNote ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Push the due date out when the member still needs the part. */
export const extendBorrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recordId: uuid, days: z.number().int().min(1).max(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: newDue, error } = await context.supabase.rpc("extend_borrow", {
      _record_id: data.recordId,
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return { dueAt: newDue as string };
  });

/** In-app return reminders generated by the scheduled sweep. */
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, kind, title, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationRow[];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type RawBorrow = {
  id: string;
  component_id: string;
  user_id: string;
  quantity: number;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  note: string | null;
  extended_count: number;
  damage_reported: boolean;
  damage_note: string | null;
  components: {
    name: string;
    bin_label: string | null;
    racks: { code: string } | null;
  } | null;
};

const BORROW_SELECT =
  "id, component_id, user_id, quantity, borrowed_at, due_at, returned_at, note, extended_count, damage_reported, damage_note, components(name, bin_label, racks(code))";

/**
 * Borrow log. RLS already limits members to their own rows; `scope: "all"`
 * only returns other members' rows for admins.
 */
export const getBorrowLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scope: z.enum(["mine", "all"]).default("mine"),
        openOnly: z.boolean().default(false),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("borrow_records")
      .select(BORROW_SELECT)
      .order("borrowed_at", { ascending: false })
      .limit(400);

    if (data.scope === "mine") query = query.eq("user_id", context.userId);
    if (data.openOnly) query = query.is("returned_at", null);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const raw = (rows ?? []) as unknown as RawBorrow[];
    const userIds = Array.from(new Set(raw.map((r) => r.user_id)));
    const nameById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id, p.full_name || p.email || "Member");
      }
    }

    return raw.map<BorrowRow>((r) => ({
      id: r.id,
      component_id: r.component_id,
      user_id: r.user_id,
      quantity: r.quantity,
      borrowed_at: r.borrowed_at,
      due_at: r.due_at,
      returned_at: r.returned_at,
      note: r.note,
      extended_count: r.extended_count,
      damage_reported: r.damage_reported,
      damage_note: r.damage_note,
      component_name: r.components?.name ?? "Unknown component",
      bin_label: r.components?.bin_label ?? null,
      rack_code: r.components?.racks?.code ?? null,
      member_name: nameById.get(r.user_id) ?? "Member",
    }));
  });


export const lookupByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("components")
      .select("id")
      .eq("qr_code", data.code.toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { componentId: row?.id ?? null };
  });
