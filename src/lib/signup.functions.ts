import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public, unauthenticated: anyone on the sign-in page can ask for an account.
 * It is created as `pending` — the approval gate in AppShell and the check in
 * borrow_component keep it inert until an admin approves it.
 */
export const requestAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(200),
        rollNumber: z.string().trim().max(40).nullable().default(null),
        phone: z.string().trim().max(20).nullable().default(null),
        password: z.string().min(8).max(72),
        // Honeypot: hidden from people, filled in by naive bots.
        website: z.string().max(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requestAccount: create } = await import("./admin.server");
    return create({
      fullName: data.fullName,
      email: data.email,
      rollNumber: data.rollNumber || null,
      phone: data.phone || null,
      password: data.password,
    });
  });
