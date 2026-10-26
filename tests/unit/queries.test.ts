import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { daysUntil, sectionTitle } from "@/lib/queries";

describe("daysUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("rounds partial days up", () => {
    expect(daysUntil("2026-10-27T12:00:00Z")).toBe(1);
    expect(daysUntil("2026-10-26T13:00:00Z")).toBe(1);
    expect(daysUntil("2026-11-02T12:00:00Z")).toBe(7);
  });

  it("is 0 at the due moment and negative when overdue", () => {
    expect(daysUntil("2026-10-26T12:00:00Z")).toBe(0);
    expect(daysUntil("2026-10-24T12:00:00Z")).toBe(-2);
  });
});

describe("sectionTitle", () => {
  it("strips a legacy 'Rack N - ' prefix", () => {
    expect(sectionTitle("Rack 2 - Sensors")).toBe("Sensors");
    expect(sectionTitle("Rack 10 – Power")).toBe("Power");
  });

  it("leaves other names alone", () => {
    expect(sectionTitle("EE Rack 2")).toBe("EE Rack 2");
  });
});
