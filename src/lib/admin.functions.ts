import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  adminForceReturn,
  adminSessionConfig,
  fetchAdminOverview,
  isAdminUnlocked,
  passwordMatches,
  runReminderSweep,
  type AdminOverview,
  type AdminSession,
} from "./admin.server";

export type { AdminLoan, AdminOverview, AdminMember, ComponentInput } from "./admin.server";

export const unlockAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const expected = process.env.SAC_ADMIN_PASSWORD;
    if (!expected) throw new Error("Admin password is not configured yet");
    if (!passwordMatches(data.password, expected)) return { ok: false as const };

    const session = await useSession<AdminSession>(adminSessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(adminSessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const getAdminOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ locked: true } | ({ locked: false } & AdminOverview)> => {
    if (!(await isAdminUnlocked())) return { locked: true };
    const overview = await fetchAdminOverview();
    return { locked: false, ...overview };
  },
);

export const adminReturnLoan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        recordId: z.string().uuid(),
        damaged: z.boolean().default(false),
        damageNote: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    return adminForceReturn(data.recordId, data.damaged, data.damageNote ?? null);
  });

export const adminSendReminders = createServerFn({ method: "POST" }).handler(async () => {
  if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
  const sent = await runReminderSweep();
  return { sent };
});

/* ------------------------------------------------------- member approvals */

export const getAdminMembers = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
  const { fetchMembers } = await import("./admin.server");
  return fetchMembers();
});

export const setMemberStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["approved", "rejected", "pending"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { setMemberApproval } = await import("./admin.server");
    return setMemberApproval(data.userId, data.status);
  });

export const createMember = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(200),
        fullName: z.string().trim().min(1).max(120),
        rollNumber: z.string().trim().max(40).nullable().default(null),
        phone: z.string().trim().max(20).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { createMember: create } = await import("./admin.server");
    return create(data);
  });

export const resetMemberPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { resetMemberPassword: reset } = await import("./admin.server");
    return reset(data.userId);
  });

/* ----------------------------------------------------------- catalogue io */

export const getAdminCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
  const { fetchCatalogue } = await import("./admin.server");
  return fetchCatalogue();
});

const componentSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60).default("misc"),
  specs: z.string().trim().max(400).nullable().default(null),
  quantity_total: z.number().int().min(0).max(100000),
  quantity_available: z.number().int().min(0).max(100000),
  rack_id: z.string().uuid().nullable().default(null),
  bin_label: z.string().trim().max(40).nullable().default(null),
  qr_code: z.string().trim().max(60).nullable().default(null),
  keywords: z.array(z.string().trim().max(40)).max(25).default([]),
  borrowable: z.boolean().default(true),
});

export const saveComponent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => componentSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { id, ...rest } = data;
    if (rest.quantity_available > rest.quantity_total) {
      throw new Error("Available cannot be more than the total");
    }
    const { upsertComponent } = await import("./admin.server");
    return upsertComponent(id, rest);
  });

export const removeComponent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { deleteComponent } = await import("./admin.server");
    return deleteComponent(data.id);
  });

export const saveRack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().default(null),
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(200).nullable().default(null),
        location_note: z.string().trim().max(200).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { id, ...rest } = data;
    const { upsertRack } = await import("./admin.server");
    return upsertRack(id, rest);
  });

export const removeRack = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { deleteRack } = await import("./admin.server");
    return deleteRack(data.id);
  });

export const addComponents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ rows: z.array(componentSchema.omit({ id: true })).min(1).max(300) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const bad = data.rows.find((r) => r.quantity_available > r.quantity_total);
    if (bad) throw new Error(`${bad.name}: available cannot be more than the total`);
    const { insertComponents } = await import("./admin.server");
    return insertComponents(data.rows);
  });

export const dismissScan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { dismissUnknownScan } = await import("./admin.server");
    return dismissUnknownScan(data.id);
  });

/* ------------------------------------------------------- member additions */

export const getAdditions = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
  const { fetchAdditions } = await import("./admin.server");
  return fetchAdditions();
});

export const saveAdditionsMode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["direct", "approval"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { setAdditionsMode } = await import("./admin.server");
    return setAdditionsMode(data.mode);
  });

export const decideSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { reviewSubmission } = await import("./admin.server");
    return reviewSubmission(data.id, data.approve, data.note || null);
  });

/* ---------------------------------------------------------- part requests */

export const getPartRequests = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
  const { fetchPartRequests } = await import("./admin.server");
  return fetchPartRequests();
});

export const updatePartRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "rejected", "ordered", "received"]),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { setPartRequestStatus } = await import("./admin.server");
    return setPartRequestStatus(data.id, data.status, data.note || null);
  });

/* ---------------------------------------------------------------- exports */

export const getExportRows = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(["inventory", "requests", "loans"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { fetchExportRows } = await import("./admin.server");
    return fetchExportRows(data.kind);
  });

/* --------------------------------------------------------- stock counting */

export const getCounting = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
  const { fetchCounting } = await import("./admin.server");
  return fetchCounting();
});

export const saveCountingMode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ mode: z.enum(["open", "locked"]) }).parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { setCountingMode } = await import("./admin.server");
    return setCountingMode(data.mode);
  });
