import { describe, expect, it } from "vitest";

import { findSimilar, similarity } from "@/lib/similar";

const catalogue = [
  { name: "L298N Motor Driver Module", keywords: ["motor driver"] },
  { name: "Arduino Nano", keywords: ["nano", "microcontroller"] },
  { name: "DS18B20 Temperature Sensor", keywords: null },
  { name: "12V 2A SMPS Adapter", keywords: [] },
  { name: "MG90S Servo", keywords: ["servo"] },
];

describe("similarity", () => {
  it("is 1 for the same name ignoring case, spacing and punctuation", () => {
    expect(similarity("arduino-nano", "Arduino Nano")).toBe(1);
    expect(similarity("  L298N  ", "l298n")).toBe(1);
  });

  it("scores a shared part number highly", () => {
    expect(similarity("L298N", "L298N Motor Driver Module")).toBeGreaterThanOrEqual(0.85);
    expect(similarity("ds18b20 probe", "DS18B20 Temperature Sensor")).toBeGreaterThanOrEqual(0.9);
  });

  it("is 0 when either side is only stop words or empty", () => {
    expect(similarity("", "Arduino Nano")).toBe(0);
    expect(similarity("module board", "Arduino Nano")).toBe(0);
  });

  it("stays in 0..1", () => {
    for (const a of ["x", "servo", "12v", "!!!", "a".repeat(500)]) {
      for (const b of catalogue) {
        const s = similarity(a, b.name);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("findSimilar (duplicate-part warning)", () => {
  it("warns about an existing part", () => {
    expect(findSimilar("l298n driver", catalogue).map((c) => c.name)).toContain(
      "L298N Motor Driver Module",
    );
  });

  it("ignores input shorter than 3 characters", () => {
    expect(findSimilar("ab", catalogue)).toEqual([]);
    expect(findSimilar(" - ", catalogue)).toEqual([]);
  });

  it("returns nothing for an unrelated part", () => {
    expect(findSimilar("Lidar Lite v3", catalogue)).toEqual([]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `MG90S Servo ${i}` }));
    expect(findSimilar("MG90S servo", many, { limit: 3 })).toHaveLength(3);
  });

  it("handles special characters and very long input without throwing", () => {
    expect(() =>
      findSimilar("<script>alert(1)</script>'; DROP TABLE x;--", catalogue),
    ).not.toThrow();
    expect(() => findSimilar("é".repeat(5000), catalogue)).not.toThrow();
  });
});
