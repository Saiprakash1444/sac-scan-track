/**
 * Vision-model transport with provider failover.
 *
 * Every supported provider speaks the OpenAI `chat/completions` shape, so one
 * request body works everywhere and switching providers is a URL + header swap.
 * Providers are resolved from env at call time and tried in order; a provider
 * whose key is unset is skipped rather than failing, so a deployment can run on
 * one key or three without a code change.
 *
 * Server-only: load with `await import()` from inside a server-fn handler so
 * the keys never reach the client bundle.
 */

export type VisionProvider = {
  name: string;
  url: string;
  model: string;
  apiKey: string;
  authHeader: string;
  authPrefix: string;
};

/** Distinguishes "everyone is rate limited" from "everyone is broken". */
export type VisionFailure = "rate_limited" | "out_of_credits" | "unavailable" | "not_configured";

export class VisionError extends Error {
  constructor(
    readonly kind: VisionFailure,
    message: string,
  ) {
    super(message);
    this.name = "VisionError";
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Order matters — first configured provider wins. Gemini leads because its free
 * tier bills image input at no charge; the generic slot is for any second
 * OpenAI-compatible endpoint (OpenRouter, Groq, Cerebras); Lovable trails so the
 * Lovable editor preview keeps working without extra setup.
 */
export function resolveVisionProviders(): VisionProvider[] {
  const providers: VisionProvider[] = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    providers.push({
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      apiKey: geminiKey,
      authHeader: "Authorization",
      authPrefix: "Bearer ",
    });
  }

  // Generic OpenAI-compatible fallback. Model id lives in env on purpose: free
  // model names churn, and a rotated name shouldn't require a redeploy.
  const fallbackKey = process.env.AI_FALLBACK_API_KEY;
  const fallbackUrl = process.env.AI_FALLBACK_URL;
  if (fallbackKey && fallbackUrl) {
    providers.push({
      name: process.env.AI_FALLBACK_NAME || "fallback",
      url: fallbackUrl,
      model: process.env.AI_FALLBACK_MODEL || "openrouter/free",
      apiKey: fallbackKey,
      authHeader: "Authorization",
      authPrefix: "Bearer ",
    });
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    providers.push({
      name: "lovable",
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      model: "google/gemini-3.6-flash",
      apiKey: lovableKey,
      authHeader: "Lovable-API-Key",
      authPrefix: "",
    });
  }

  return providers;
}

function classify(status: number): VisionFailure {
  if (status === 429) return "rate_limited";
  if (status === 402) return "out_of_credits";
  return "unavailable";
}

/** Worst-case wins, so "all rate limited" isn't masked by one 500. */
function worst(a: VisionFailure, b: VisionFailure): VisionFailure {
  const rank: Record<VisionFailure, number> = {
    not_configured: 0,
    rate_limited: 1,
    out_of_credits: 2,
    unavailable: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Sends one OpenAI-style message array to the first provider that answers.
 * Returns the raw assistant message content — parsing stays with the caller.
 */
export async function callVisionModel(messages: unknown[]): Promise<string> {
  const providers = resolveVisionProviders();

  if (providers.length === 0) {
    throw new VisionError(
      "not_configured",
      "AI scanning is not configured. Set GEMINI_API_KEY to enable camera identification.",
    );
  }

  let failure: VisionFailure | null = null;

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          [provider.authHeader]: `${provider.authPrefix}${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `[vision] ${provider.name} (${provider.model}) failed ${response.status}: ${body.slice(0, 500)}`,
        );
        failure = failure ? worst(failure, classify(response.status)) : classify(response.status);
        continue;
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content;

      // A 200 with no content is as useless as an error — fall through.
      if (!content) {
        console.error(`[vision] ${provider.name} returned 200 with empty content`);
        failure = failure ? worst(failure, "unavailable") : "unavailable";
        continue;
      }

      return content;
    } catch (error) {
      // Network failure, DNS, or the 30s timeout.
      console.error(`[vision] ${provider.name} threw`, error);
      failure = failure ? worst(failure, "unavailable") : "unavailable";
    }
  }

  const message =
    failure === "rate_limited"
      ? "AI scanning is rate limited right now — try again in a moment."
      : failure === "out_of_credits"
        ? "AI credits are exhausted. Add credits or wait for the daily quota to reset."
        : "Could not identify the photo. Use manual search instead.";

  throw new VisionError(failure ?? "unavailable", message);
}
