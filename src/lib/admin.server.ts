import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
  purpose: "project" | "personal";
  project_name: string | null;
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
  purpose: string;
  project_name: string | null;
  components: { name: string; bin_label: string | null; racks: { code: string } | null } | null;
};

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [loansRes, componentsRes, profilesRes] = await Promise.all([
    supabaseAdmin
      .from("borrow_records")
      .select(
        "id, user_id, quantity, borrowed_at, due_at, returned_at, extended_count, damage_reported, damage_note, purpose, project_name, components(name, bin_label, racks(code))",
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
    purpose: r.purpose === "project" ? "project" : "personal",
    project_name: r.project_name,
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
          ? "An admin approved your RMI Inventory account — you can borrow components now."
          : "An admin declined your access request. Talk to a club coordinator.",
    });
  }
  return { ok: true };
}

/* --------------------------------------------------------- member creation */

/**
 * Temporary password an admin reads out or pastes into a chat. Drawn from an
 * alphabet with the ambiguous glyphs removed (`0 O 1 l I`) because these get
 * transcribed by hand far more often than they get copy-pasted.
 */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // 57 chars
  const limit = 228; // 57 × 4 — reject the tail so every character stays equally likely
  let out = "";
  while (out.length < 12) {
    for (const byte of randomBytes(24)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === 12) break;
    }
  }
  return out;
}

export type NewMemberInput = {
  email: string;
  fullName: string;
  rollNumber: string | null;
  phone: string | null;
};

/**
 * Creates a member account outright — there is no public sign-up. Returns the
 * generated password once; it is never stored in readable form, so an admin who
 * loses it has to issue a new one rather than look the old one up.
 */
export async function createMember(input: NewMemberInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const password = generateTempPassword();

  // email_confirm skips the confirmation mail: the credentials are handed over
  // in person. Supabase's built-in SMTP is rate limited to a handful of messages
  // an hour on the free tier, which would stall onboarding a whole club anyway.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error) {
    // Supabase phrases the duplicate case in a way that reads badly in a toast.
    if (/already|exists|registered/i.test(error.message)) {
      throw new Error("That email already has an account.");
    }
    throw new Error(error.message);
  }

  const userId = data.user?.id;
  if (!userId) throw new Error("Supabase accepted the request but returned no user");

  // handle_new_user() has already inserted the profile row as `pending`. An
  // admin-created account is approved by definition, so flip it and fill in the
  // fields the trigger cannot see. Upsert rather than update: if the trigger is
  // ever missing, an update would silently touch zero rows and leave a member
  // who can sign in but has no profile.
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      full_name: input.fullName,
      email: input.email,
      roll_number: input.rollNumber,
      phone: input.phone,
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: "admin-panel",
    } as never,
    { onConflict: "id" },
  );
  if (profileError) throw new Error(profileError.message);

  return { userId, password };
}

/** Issues a fresh password for an existing member who has lost theirs. */
export async function resetMemberPassword(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const password = generateTempPassword();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
  return { password };
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
  const row: ComponentInput & { count_pending?: boolean; counted_at?: string } = {
    ...input,
    qr_code: input.qr_code ? input.qr_code.toUpperCase() : null,
  };
  if (id) {
    // An admin typing new quantities is a count; clear the pending flag then.
    const { data: before } = await supabaseAdmin
      .from("components")
      .select("quantity_total, quantity_available")
      .eq("id", id)
      .maybeSingle();
    if (
      before &&
      (before.quantity_total !== input.quantity_total ||
        before.quantity_available !== input.quantity_available)
    ) {
      row.count_pending = false;
      row.counted_at = new Date().toISOString();
    }
  }
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

export async function deleteRack(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error: countError } = await supabaseAdmin
    .from("components")
    .select("id", { count: "exact", head: true })
    .eq("rack_id", id);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error("Move or delete the parts in this section first");
  }
  const { error } = await supabaseAdmin.from("racks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Adds many parts in one insert, so a freshly sorted section lands all at once. */
export async function insertComponents(rows: ComponentInput[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const prepared = rows.map((row) => ({
    ...row,
    qr_code: row.qr_code ? row.qr_code.toUpperCase() : null,
  }));
  const { data, error } = await supabaseAdmin.from("components").insert(prepared).select("id");
  if (error) throw new Error(error.message);
  return { added: data?.length ?? 0 };
}

export async function fetchCatalogue() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [racks, components, unknowns] = await Promise.all([
    supabaseAdmin.from("racks").select("id, code, name, description, location_note").order("code"),
    supabaseAdmin
      .from("components")
      .select(
        "id, name, category, specs, quantity_total, quantity_available, rack_id, bin_label, qr_code, keywords, borrowable, count_pending",
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

/* ------------------------------------------------------- member additions */

export type AdminSubmission = {
  id: string;
  name: string;
  category: string;
  specs: string | null;
  quantity: number;
  rack_id: string | null;
  bin_label: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  member_name: string;
};

export async function fetchAdditions() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [setting, pending] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", "member_additions").maybeSingle(),
    supabaseAdmin
      .from("component_submissions")
      .select("id, name, category, specs, quantity, rack_id, bin_label, note, status, created_at, submitted_by")
      .eq("status", "pending")
      .order("created_at")
      .limit(200),
  ]);
  if (pending.error) throw new Error(pending.error.message);

  const rows = pending.data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.submitted_by)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    for (const p of profiles ?? []) names.set(p.id, p.full_name || p.email || "Member");
  }

  return {
    mode: (setting.data?.value === "direct" ? "direct" : "approval") as "direct" | "approval",
    pending: rows.map<AdminSubmission>(({ submitted_by, ...r }) => ({
      ...r,
      status: r.status as AdminSubmission["status"],
      member_name: names.get(submitted_by) ?? "Member",
    })),
  };
}

export async function setAdditionsMode(mode: "direct" | "approval") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key: "member_additions", value: mode, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { mode };
}

/** Approve turns the submission into a catalogue part; either way the member is told. */
export async function reviewSubmission(id: string, approve: boolean, note: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sub, error } = await supabaseAdmin
    .from("component_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sub) throw new Error("Submission not found");
  if (sub.status !== "pending") throw new Error("This has already been reviewed");

  let componentId: string | null = null;
  if (approve) {
    const { data: created, error: insertError } = await supabaseAdmin
      .from("components")
      .insert({
        name: sub.name,
        category: sub.category,
        specs: sub.specs,
        quantity_total: sub.quantity,
        quantity_available: sub.quantity,
        rack_id: sub.rack_id,
        bin_label: sub.bin_label,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    componentId = created.id;
  }

  const { error: updateError } = await supabaseAdmin
    .from("component_submissions")
    .update({
      status: approve ? "approved" : "rejected",
      component_id: componentId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("notifications").insert({
    user_id: sub.submitted_by,
    kind: approve ? "submission_approved" : "submission_rejected",
    title: approve ? `Added to the catalogue: ${sub.name}` : `Not added: ${sub.name}`,
    body: approve
      ? `${sub.quantity} × ${sub.name} is now in the catalogue. Thanks for adding it.`
      : note
        ? `An admin didn't add ${sub.name}: ${note}`
        : `An admin didn't add ${sub.name} to the catalogue.`,
  });

  return { ok: true, componentId };
}

/* ---------------------------------------------------------- part requests */

export type AdminPartRequest = {
  id: string;
  name: string;
  quantity: number;
  reason: string | null;
  link: string | null;
  est_price: number | null;
  status: "pending" | "approved" | "rejected" | "ordered" | "received";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  member_name: string;
};

async function memberNames(ids: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const names = new Map<string, string>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return names;
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", unique);
  for (const p of data ?? []) names.set(p.id, p.full_name || p.email || "Member");
  return names;
}

export async function fetchPartRequests(): Promise<AdminPartRequest[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("part_requests")
    .select("id, name, quantity, reason, link, est_price, status, admin_note, created_at, reviewed_at, requested_by")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = await memberNames(rows.map((r) => r.requested_by));
  return rows.map(({ requested_by, ...r }) => ({
    ...r,
    status: r.status as AdminPartRequest["status"],
    member_name: names.get(requested_by) ?? "Member",
  }));
}

const REQUEST_MESSAGES: Record<string, (name: string) => string> = {
  approved: (n) => `Your request for ${n} was approved — the club will source it.`,
  rejected: (n) => `Your request for ${n} wasn't approved.`,
  ordered: (n) => `${n} has been ordered.`,
  received: (n) => `${n} has arrived in the club room.`,
};

export async function setPartRequestStatus(
  id: string,
  status: "approved" | "rejected" | "ordered" | "received",
  note: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: req, error } = await supabaseAdmin
    .from("part_requests")
    .update({ status, admin_note: note, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("requested_by, name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!req) throw new Error("Request not found");

  const message = REQUEST_MESSAGES[status](req.name);
  await supabaseAdmin.from("notifications").insert({
    user_id: req.requested_by,
    kind: `request_${status}`,
    title: `Request ${status}: ${req.name}`,
    body: note ? `${message} Note: ${note}` : message,
  });
  return { ok: true };
}

/* ---------------------------------------------------------------- exports */

/** Flat rows for spreadsheet download. Column order is the order of keys. */
export async function fetchExportRows(kind: "inventory" | "requests" | "loans") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (kind === "inventory") {
    const { data, error } = await supabaseAdmin
      .from("components")
      .select(
        "name, category, specs, quantity_total, quantity_available, bin_label, borrowable, qr_code, count_pending, racks(code, name)",
      )
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({
      Section: c.racks?.code ?? "",
      "Section name": c.racks?.name ?? "",
      Bin: c.bin_label ?? "",
      Name: c.name,
      Category: c.category,
      Specs: c.specs ?? "",
      Total: c.quantity_total,
      Available: c.quantity_available,
      "Out on loan": Math.max(0, c.quantity_total - c.quantity_available),
      Borrowable: c.borrowable ? "yes" : "room only",
      Count: c.count_pending ? "pending" : "counted",
      "QR code": c.qr_code ?? "",
    }));
  }

  if (kind === "requests") {
    const rows = await fetchPartRequests();
    return rows.map((r) => ({
      Requested: r.created_at.slice(0, 10),
      "Requested by": r.member_name,
      Part: r.name,
      Quantity: r.quantity,
      "Est. price (each)": r.est_price ?? "",
      "Est. total": r.est_price != null ? Number((r.est_price * r.quantity).toFixed(2)) : "",
      Link: r.link ?? "",
      Reason: r.reason ?? "",
      Status: r.status,
      "Admin note": r.admin_note ?? "",
    }));
  }

  const { data, error } = await supabaseAdmin
    .from("borrow_records")
    .select("quantity, borrowed_at, due_at, returned_at, purpose, project_name, damage_reported, user_id, components(name, racks(code))")
    .order("borrowed_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  const names = await memberNames((data ?? []).map((r) => r.user_id));
  const now = Date.now();
  return (data ?? []).map((r) => ({
    Borrowed: r.borrowed_at.slice(0, 10),
    Member: names.get(r.user_id) ?? "Member",
    Part: r.components?.name ?? "",
    Section: r.components?.racks?.code ?? "",
    Quantity: r.quantity,
    Purpose: r.purpose === "project" ? `Project: ${r.project_name ?? ""}` : "Personal",
    Due: r.due_at.slice(0, 10),
    Returned: r.returned_at ? r.returned_at.slice(0, 10) : "",
    Status: r.returned_at
      ? r.damage_reported
        ? "returned (damaged)"
        : "returned"
      : new Date(r.due_at).getTime() < now
        ? "OVERDUE"
        : "out",
  }));
}

/* --------------------------------------------------------- stock counting */

export async function fetchCounting() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [setting, total, pending] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", "member_counting").maybeSingle(),
    supabaseAdmin.from("components").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("components")
      .select("id", { count: "exact", head: true })
      .eq("count_pending", true),
  ]);
  if (total.error) throw new Error(total.error.message);
  if (pending.error) throw new Error(pending.error.message);
  return {
    mode: (setting.data?.value === "open" ? "open" : "locked") as "open" | "locked",
    total: total.count ?? 0,
    pending: pending.count ?? 0,
  };
}

export async function setCountingMode(mode: "open" | "locked") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key: "member_counting", value: mode, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { mode };
}
