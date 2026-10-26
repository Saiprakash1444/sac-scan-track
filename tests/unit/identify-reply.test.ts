import { describe, expect, it } from "vitest";

import { parseIdentifyReply } from "@/lib/identify-reply";

const KNOWN = new Set(["11111111-1111-4111-8111-111111111111"]);
const KNOWN_ID = [...KNOWN][0];

describe("parseIdentifyReply — AI hallucination firewall", () => {
  it("keeps an id that was in the catalogue sent with the request", () => {
    const out = parseIdentifyReply(
      JSON.stringify({ id: KNOWN_ID, label: "L298N driver", confidence: "high" }),
      KNOWN,
    );
    expect(out.componentId).toBe(KNOWN_ID);
    expect(out.confidence).toBe("high");
  });

  it("drops an invented id", () => {
    const out = parseIdentifyReply(
      JSON.stringify({ id: "99999999-9999-4999-8999-999999999999", label: "Servo" }),
      KNOWN,
    );
    expect(out.componentId).toBeNull();
    expect(out.label).toBe("Servo");
  });

  it("drops a non-string id", () => {
    expect(parseIdentifyReply(JSON.stringify({ id: 42 }), KNOWN).componentId).toBeNull();
    expect(parseIdentifyReply(JSON.stringify({ id: [KNOWN_ID] }), KNOWN).componentId).toBeNull();
  });

  it("salvages JSON wrapped in prose or code fences", () => {
    const content = "Sure! ```json\n" + JSON.stringify({ id: KNOWN_ID, label: "x" }) + "\n```";
    expect(parseIdentifyReply(content, KNOWN).componentId).toBe(KNOWN_ID);
  });

  it.each([
    ["empty", ""],
    ["garbage", "I can't tell"],
    ["broken JSON", '{"id": "abc", '],
    ["JSON null", "null"],
    ["JSON array", `["${KNOWN_ID}"]`],
    ["JSON number", "7"],
  ])("never throws on %s and falls back safely", (_name, content) => {
    const out = parseIdentifyReply(content, KNOWN);
    expect(out.componentId).toBeNull();
    expect(out.label).toBe("Unrecognised part");
    expect(out.confidence).toBe("low");
    expect(out.specs).toEqual([]);
  });

  it("clamps every string field and the specs list", () => {
    const long = "x".repeat(1000);
    const out = parseIdentifyReply(
      JSON.stringify({
        label: long,
        category: long,
        description: long,
        reason: long,
        searchQuery: long,
        specs: [long, "a", "b", "c", "d", 5],
      }),
      KNOWN,
    );
    expect(out.label).toHaveLength(90);
    expect(out.category).toHaveLength(40);
    expect(out.description).toHaveLength(220);
    expect(out.reason).toHaveLength(140);
    expect(out.searchQuery).toHaveLength(90);
    expect(out.specs).toHaveLength(4);
  });

  it("only accepts high/medium confidence, anything else is low", () => {
    expect(parseIdentifyReply('{"confidence":"medium"}', KNOWN).confidence).toBe("medium");
    expect(parseIdentifyReply('{"confidence":"certain"}', KNOWN).confidence).toBe("low");
  });
});
