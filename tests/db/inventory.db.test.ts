import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Fixtures } from "./fixtures";
import { assertIsolatedTestDb } from "./guard";

// Runs ONLY against an isolated test project (guard.ts aborts otherwise).
// Real RPCs, real RLS, real row locks — signed in as synthetic members with the
// anon key. The service role is used only to seed and inspect, never to prove a
// member restriction.

let fx: Fixtures;
let rack: string;

beforeAll(async () => {
  fx = new Fixtures(await assertIsolatedTestDb());
  rack = await fx.rack();
}, 60_000);

afterAll(async () => {
  await fx?.cleanup();
}, 60_000);

const borrow = (client: Fixtures["admin"], componentId: string, quantity: number, days = 7) =>
  client.rpc("borrow_component", {
    _component_id: componentId,
    _quantity: quantity,
    _days: days,
    _purpose: "personal",
  });

describe("borrow_component", () => {
  it("decrements stock exactly once and records the borrower", async () => {
    const a = await fx.member("a");
    const part = await fx.component(rack, { qty: 5 });
    const { error } = await borrow(a.client, part, 3);
    expect(error).toBeNull();
    expect(await fx.stock(part)).toEqual({ total: 5, available: 2 });
    const loans = await fx.loans(part);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ user_id: a.id, quantity: 3, returned_at: null });
  });

  it("rejects over-borrowing with no partial state", async () => {
    const a = await fx.member("over");
    const part = await fx.component(rack, { qty: 2 });
    const { error } = await borrow(a.client, part, 3);
    expect(error?.message).toMatch(/Only 2 available/);
    expect(await fx.stock(part)).toEqual({ total: 2, available: 2 });
    expect(await fx.loans(part)).toHaveLength(0);
  });

  // The 1..100 cap lives only in the Zod layer; the SQL accepts any qty ≤ stock (QA-009).
  it.each([0, -1])("rejects quantity %i", async (qty) => {
    const a = await fx.member(`q${qty}`.replace("-", "m"));
    const part = await fx.component(rack, { qty: 200 });
    const { error } = await borrow(a.client, part, qty);
    expect(error).not.toBeNull();
    expect((await fx.stock(part)).available).toBe(200);
  });

  it.each([0, 91])("rejects %i days", async (days) => {
    const a = await fx.member(`d${days}`);
    const part = await fx.component(rack, { qty: 1 });
    expect((await borrow(a.client, part, 1, days)).error).not.toBeNull();
  });

  it("blocks pending members", async () => {
    const p = await fx.member("pending", { approved: false });
    const part = await fx.component(rack, { qty: 1 });
    expect((await borrow(p.client, part, 1)).error?.message).toMatch(/approval/);
    expect((await fx.stock(part)).available).toBe(1);
  });

  it("blocks non-borrowable shared bins", async () => {
    const a = await fx.member("bin");
    const part = await fx.component(rack, { qty: 50, borrowable: false });
    expect((await borrow(a.client, part, 1)).error?.message).toMatch(/stays in the room/);
  });

  it("requires a project name for project borrows", async () => {
    const a = await fx.member("proj");
    const part = await fx.component(rack, { qty: 1 });
    const { error } = await a.client.rpc("borrow_component", {
      _component_id: part,
      _quantity: 1,
      _purpose: "project",
      _project_name: "   ",
    });
    expect(error?.message).toMatch(/Name the project/);
  });
});

describe("concurrency (row lock)", () => {
  it("two members racing for the last unit: exactly one wins", async () => {
    const [a, b] = await Promise.all([fx.member("race-a"), fx.member("race-b")]);
    const part = await fx.component(rack, { qty: 1 });
    const results = await Promise.all([borrow(a.client, part, 1), borrow(b.client, part, 1)]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toMatch(/Only 0 available/);
    expect(await fx.stock(part)).toEqual({ total: 1, available: 0 });
    expect(await fx.loans(part)).toHaveLength(1);
  });

  it("combined demand above stock never drives it negative", async () => {
    const members = await Promise.all(["c1", "c2", "c3", "c4"].map((l) => fx.member(l)));
    const part = await fx.component(rack, { qty: 5 });
    const results = await Promise.all(members.map((m) => borrow(m.client, part, 2)));
    const won = results.filter((r) => !r.error).length;
    expect(won).toBe(2);
    const { available } = await fx.stock(part);
    expect(available).toBe(1);
    const out = (await fx.loans(part)).reduce((n, l) => n + l.quantity, 0);
    expect(out + available).toBe(5);
  });

  it("returning the same loan twice at once restores stock once", async () => {
    const a = await fx.member("ret2");
    const part = await fx.component(rack, { qty: 4 });
    await borrow(a.client, part, 3);
    const [loan] = await fx.loans(part);
    await Promise.all([
      a.client.rpc("return_component", { _record_id: loan.id }),
      a.client.rpc("return_component", { _record_id: loan.id }),
    ]);
    await a.client.rpc("return_component", { _record_id: loan.id });
    expect(await fx.stock(part)).toEqual({ total: 4, available: 4 });
  });
});

describe("return / extend", () => {
  it("a damaged return writes the units off the total", async () => {
    const a = await fx.member("dmg");
    const part = await fx.component(rack, { qty: 4 });
    await borrow(a.client, part, 2);
    const [loan] = await fx.loans(part);
    await a.client.rpc("return_component", {
      _record_id: loan.id,
      _damaged: true,
      _damage_note: "burnt",
    });
    expect(await fx.stock(part)).toEqual({ total: 2, available: 2 });
  });

  it("members cannot return or extend someone else's loan", async () => {
    const [a, b] = await Promise.all([fx.member("own-a"), fx.member("own-b")]);
    const part = await fx.component(rack, { qty: 2 });
    await borrow(a.client, part, 1);
    const [loan] = await fx.loans(part);
    expect(
      (await b.client.rpc("return_component", { _record_id: loan.id })).error?.message,
    ).toMatch(/Not allowed/);
    expect(
      (await b.client.rpc("extend_borrow", { _record_id: loan.id, _days: 5 })).error?.message,
    ).toMatch(/Not allowed/);
    expect((await fx.stock(part)).available).toBe(1);
  });

  it("members get at most 3 extensions", async () => {
    const a = await fx.member("ext");
    const part = await fx.component(rack, { qty: 1 });
    await borrow(a.client, part, 1);
    const [loan] = await fx.loans(part);
    for (let i = 0; i < 3; i++) {
      expect(
        (await a.client.rpc("extend_borrow", { _record_id: loan.id, _days: 1 })).error,
      ).toBeNull();
    }
    expect(
      (await a.client.rpc("extend_borrow", { _record_id: loan.id, _days: 1 })).error?.message,
    ).toMatch(/3 times/);
  });
});

describe("damage reports", () => {
  it("a report alone never changes stock; a write-off applies once", async () => {
    const a = await fx.member("rep");
    const part = await fx.component(rack, { qty: 3 });
    const { data: report, error } = await a.client
      .from("damage_reports")
      .insert({ component_id: part, reported_by: a.id, quantity: 1, note: "cracked" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(await fx.stock(part)).toEqual({ total: 3, available: 3 });

    // Members cannot resolve.
    expect(
      (await a.client.rpc("resolve_damage_report", { _report_id: report!.id, _write_off: true }))
        .error,
    ).not.toBeNull();

    const first = await fx.admin.rpc("resolve_damage_report", {
      _report_id: report!.id,
      _write_off: true,
    });
    const second = await fx.admin.rpc("resolve_damage_report", {
      _report_id: report!.id,
      _write_off: true,
    });
    expect(first.error).toBeNull();
    expect(second.error?.message).toMatch(/already handled/);
    expect(await fx.stock(part)).toEqual({ total: 2, available: 2 });
  });
});

// QA-001 / QA-002 / QA-003: these assert the SAFE behaviour and are expected to
// FAIL until the RLS policies are tightened (see docs/QA-REPORT.md).
describe("RLS: members cannot bypass the borrowing rules", () => {
  it("QA-001 member cannot rewrite their own loan row directly", async () => {
    const a = await fx.member("rls-upd");
    const part = await fx.component(rack, { qty: 5 });
    await borrow(a.client, part, 4);
    const [loan] = await fx.loans(part);
    await a.client
      .from("borrow_records")
      .update({ quantity: 1, extended_count: 0, due_at: "2099-01-01T00:00:00Z" })
      .eq("id", loan.id);
    const [after] = await fx.loans(part);
    expect(after).toMatchObject({ quantity: 4, extended_count: 0 });
    expect(after.due_at.startsWith("2099")).toBe(false);
  });

  it("QA-002 member cannot insert a loan without taking stock", async () => {
    const a = await fx.member("rls-ins");
    const part = await fx.component(rack, { qty: 2 });
    const { error } = await a.client.from("borrow_records").insert({
      component_id: part,
      user_id: a.id,
      quantity: 2,
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error).not.toBeNull();
    expect(await fx.loans(part)).toHaveLength(0);
  });

  it("QA-003 a pending (just-requested) account cannot read other members' contact details", async () => {
    await fx.member("rls-victim");
    const p = await fx.member("rls-pending", { approved: false });
    const { data } = await p.client.from("profiles").select("id, email, phone").neq("id", p.id);
    expect(data ?? []).toHaveLength(0);
  });
});
