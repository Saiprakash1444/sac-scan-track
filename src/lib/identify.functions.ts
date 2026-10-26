import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { parseIdentifyReply } from "./identify-reply";

export type IdentifyResult = {
  /** Set only when the part exists in the club catalogue. */
  componentId: string | null;
  /** What the part actually is — filled in even for parts we've never stocked. */
  label: string;
  category: string;
  description: string;
  specs: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
  /** Handy search string for a Google Lens / Google image lookup. */
  searchQuery: string;
};

/**
 * Open-world identification: the model first says what the object *is*
 * (no catalogue constraint), then — separately — tells us whether it lines up
 * with a row of the club catalogue so we can jump straight to stock + location.
 */
export const identifyComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        imageDataUrl: z
          .string()
          .startsWith("data:image/")
          .max(8_000_000, "Photo is too large, try again"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<IdentifyResult> => {
    // Server-only: keeps provider API keys out of the client bundle.
    const { callVisionModel } = await import("./ai-vision.server");

    const { data: rows, error } = await context.supabase
      .from("components")
      .select("id, name, category, specs, keywords")
      .order("name");
    if (error) throw new Error(error.message);

    const catalogue = (rows ?? [])
      .map(
        (c) =>
          `${c.id} | ${c.name} | ${c.category} | ${c.specs ?? ""} | ${(c.keywords ?? []).join(", ")}`,
      )
      .join("\n");

    const content = await callVisionModel([
      {
        role: "system",
        content: [
          "You are a hardware identification expert for a college robotics club.",
          "STEP 1 — Identify the object in the photo on its own merits. Name the exact part if you can (e.g. 'Arduino Nano V3 (CH340)', 'MG996R servo', 'TP4056 charging module'). Never restrict yourself to any list. If it is generic (a resistor, a screw, an IC), say the generic family.",
          "STEP 2 — Only then, check whether it corresponds to a row of the club catalogue below (format: id | name | category | specs | keywords). Tiny indistinguishable parts (resistors, capacitors, ICs, LEDs, screws) should map to the relevant shared *box* row. If nothing plausibly matches, return an empty id — that is a normal, useful answer.",
          "",
          "Reply with strict JSON only:",
          '{"label":"<specific part name>","category":"<short family, e.g. microcontroller, motor, sensor, passive, tool>","description":"<max 30 words: what it does / what it is used for>","specs":["<up to 4 short key specs, e.g. 5V logic, 16MHz>"],"searchQuery":"<best 3-8 word web search phrase for this part>","id":"<catalogue id or empty string>","confidence":"high|medium|low","reason":"<max 18 words>"}',
          "",
          "CATALOGUE:",
          catalogue || "(empty)",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: "What is this part? Identify it, then match the catalogue." },
          { type: "image_url", image_url: { url: data.imageDataUrl } },
        ],
      },
    ]);

    return parseIdentifyReply(content, new Set((rows ?? []).map((c) => c.id)));
  });

/** Queue an unrecognised part so an admin can add it to the catalogue. */
export const reportUnknownScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        category: z.string().trim().max(60).optional(),
        notes: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("unknown_scans").insert({
      user_id: context.userId,
      guessed_name: data.name,
      guessed_category: data.category ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
