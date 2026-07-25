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

export type { AdminLoan, AdminOverview } from "./admin.server";

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
