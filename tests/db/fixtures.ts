import { randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { TestEnv } from "./guard";

/**
 * Synthetic fixtures for one test run. Every row it creates is tracked by id and
 * cleanup deletes only those ids — never by broad conditions.
 */
export class Fixtures {
  readonly runId = randomUUID().slice(0, 8);
  readonly admin: SupabaseClient;
  private userIds: string[] = [];
  private rackIds: string[] = [];
  private componentIds: string[] = [];

  constructor(private env: TestEnv) {
    this.admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });
  }

  /** Creates a synthetic member and returns a client signed in as them. */
  async member(label: string, opts: { approved?: boolean; adminRole?: boolean } = {}) {
    const email = `qa-${this.runId}-${label}@example.test`;
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA ${label} ${this.runId}` },
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    const id = data.user.id;
    this.userIds.push(id);

    if (opts.approved !== false) {
      const { error: e } = await this.admin
        .from("profiles")
        .update({ approval_status: "approved", approved_at: new Date().toISOString() })
        .eq("id", id);
      if (e) throw e;
    }
    if (opts.adminRole) {
      const { error: e } = await this.admin
        .from("user_roles")
        .insert({ user_id: id, role: "admin" });
      if (e) throw e;
    }

    const client = createClient(this.env.url, this.env.anonKey, {
      auth: { persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { id, client };
  }

  async rack() {
    const { data, error } = await this.admin
      .from("racks")
      .insert({ code: `QA-${this.runId}`, name: `QA rack ${this.runId}` })
      .select("id")
      .single();
    if (error) throw error;
    this.rackIds.push(data.id);
    return data.id as string;
  }

  async component(rackId: string, fields: { qty: number; borrowable?: boolean; name?: string }) {
    const { data, error } = await this.admin
      .from("components")
      .insert({
        name: fields.name ?? `QA part ${this.runId} ${this.componentIds.length}`,
        category: "qa",
        rack_id: rackId,
        quantity_total: fields.qty,
        quantity_available: fields.qty,
        borrowable: fields.borrowable ?? true,
      })
      .select("id")
      .single();
    if (error) throw error;
    this.componentIds.push(data.id);
    return data.id as string;
  }

  async stock(componentId: string) {
    const { data, error } = await this.admin
      .from("components")
      .select("quantity_total, quantity_available")
      .eq("id", componentId)
      .single();
    if (error) throw error;
    return { total: data.quantity_total as number, available: data.quantity_available as number };
  }

  async loans(componentId: string) {
    const { data, error } = await this.admin
      .from("borrow_records")
      .select("id, user_id, quantity, returned_at, extended_count, due_at")
      .eq("component_id", componentId);
    if (error) throw error;
    return data;
  }

  /** Foreign-key-aware, id-scoped, idempotent. */
  async cleanup() {
    const ids = this.componentIds;
    if (ids.length) {
      await this.admin.from("damage_reports").delete().in("component_id", ids);
      await this.admin.from("borrow_records").delete().in("component_id", ids);
      await this.admin.from("components").delete().in("id", ids);
    }
    if (this.rackIds.length) await this.admin.from("racks").delete().in("id", this.rackIds);
    for (const id of this.userIds) await this.admin.auth.admin.deleteUser(id);
    this.componentIds = [];
    this.rackIds = [];
    this.userIds = [];
  }
}
