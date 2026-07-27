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

export const dismissScan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    if (!(await isAdminUnlocked())) throw new Error("Admin panel is locked");
    const { dismissUnknownScan } = await import("./admin.server");
    return dismissUnknownScan(data.id);
  });
