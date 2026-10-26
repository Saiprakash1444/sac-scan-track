import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

/**
 * Fail-closed isolation check for every database test. All of these must hold,
 * otherwise the run aborts as BLOCKED before a single write:
 *   1. TEST_* variables are set (never the app's own SUPABASE_* ones).
 *   2. SAC_TEST_DB_CONFIRM=isolated-test-project was set by a person on purpose.
 *   3. The URL is not a known production/legacy project ref.
 *   4. The URL is not the one in the app's .env (which is production today).
 *   5. The database itself carries the sentinel row public.qa_sentinel
 *      (kind = 'isolated-test'), created by hand in the test project only.
 */
export const KNOWN_NON_TEST_REFS = ["ngwmqatnrkuxhszxcjds", "ioadezusvonzohoyepnu"];

export type TestEnv = { url: string; anonKey: string; serviceKey: string };

function appEnvUrls(): string[] {
  try {
    return readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => /^(VITE_)?SUPABASE_URL=/.test(l))
      .map((l) => l.split("=")[1]?.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function assertIsolatedTestDb(): Promise<TestEnv> {
  const url = process.env.TEST_SUPABASE_URL ?? "";
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const blocked = (why: string) => new Error(`BLOCKED (database isolation): ${why}`);

  if (!url || !anonKey || !serviceKey) {
    throw blocked(
      "TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY not set",
    );
  }
  if (process.env.SAC_TEST_DB_CONFIRM !== "isolated-test-project") {
    throw blocked("SAC_TEST_DB_CONFIRM=isolated-test-project not set");
  }
  if (KNOWN_NON_TEST_REFS.some((ref) => url.includes(ref))) {
    throw blocked("TEST_SUPABASE_URL is a known production project");
  }
  if (appEnvUrls().some((appUrl) => appUrl.replace(/\/$/, "") === url.replace(/\/$/, ""))) {
    throw blocked("TEST_SUPABASE_URL is the same database the app's .env uses");
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.from("qa_sentinel").select("kind").limit(1).maybeSingle();
  if (error || data?.kind !== "isolated-test") {
    throw blocked(
      "sentinel row public.qa_sentinel(kind='isolated-test') not found in this database",
    );
  }
  return { url, anonKey, serviceKey };
}
