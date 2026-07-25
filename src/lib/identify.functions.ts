import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type IdentifyResult = {
  componentId: string | null;
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

/**
 * Camera-first identification: the photo is matched against the club's own
 * component catalogue, so the model only ever picks from known parts.
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
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured for this project yet.");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You identify electronics and robotics hardware in photos for a college robotics club inventory.",
              "You must match the photo to ONE row of the provided catalogue (format: id | name | category | specs | keywords).",
              "Small indistinguishable parts (resistors, capacitors, ICs, LEDs, screws) should map to the relevant *box* row instead of a specific value.",
              'Reply with strict JSON: {"id": "<catalogue id or empty string>", "label": "<what you see>", "confidence": "high|medium|low", "reason": "<max 18 words>"}.',
              "Use an empty id when nothing in the catalogue plausibly matches.",
              "",
              "CATALOGUE:",
              catalogue,
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this component from the catalogue." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (response.status === 429) {
      throw new Error("AI scanning is rate limited right now — try again in a moment.");
    }
    if (response.status === 402) {
      throw new Error("AI credits are exhausted. Add credits to keep camera scanning working.");
    }
    if (!response.ok) {
      const body = await response.text();
      console.error("[identify] gateway error", response.status, body);
      throw new Error("Could not identify the photo. Use manual search instead.");
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "{}";

    let parsed: { id?: string; label?: string; confidence?: string; reason?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = {};
        }
      }
    }

    const known = new Set((rows ?? []).map((c) => c.id));
    const id = parsed.id && known.has(parsed.id) ? parsed.id : null;
    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low";

    return {
      componentId: id,
      label: (parsed.label ?? "Unrecognised part").slice(0, 90),
      confidence,
      reason: (parsed.reason ?? "").slice(0, 140),
    };
  });
