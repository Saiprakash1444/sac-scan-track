// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadCsv } from "@/lib/csv";

let captured: Blob | null = null;

beforeEach(() => {
  captured = null;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    captured = blob;
    return "blob:test";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// jsdom's Blob has no .text()/.arrayBuffer(); FileReader is what it supports.
function read(blob: Blob, as: "text" | "buffer") {
  return new Promise<string | ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    if (as === "text") reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });
}

async function csvOf(rows: Record<string, string | number>[]) {
  downloadCsv("x.csv", rows);
  expect(captured).not.toBeNull();
  return ((await read(captured!, "text")) as string).replace(/^\uFEFF/, "");
}

describe("downloadCsv", () => {
  it("writes a header row and CRLF-separated rows", async () => {
    const text = await csvOf([
      { name: "Servo", qty: 2 },
      { name: "Nano", qty: 1 },
    ]);
    expect(text).toBe("name,qty\r\nServo,2\r\nNano,1");
  });

  it("quotes commas, quotes and newlines", async () => {
    const text = await csvOf([{ note: 'He said "hi", then\nleft' }]);
    expect(text).toBe('note\r\n"He said ""hi"", then\nleft"');
  });

  it("starts with a UTF-8 BOM so Excel keeps non-ASCII names", async () => {
    downloadCsv("x.csv", [{ name: "Résistance ×" }]);
    const bytes = new Uint8Array((await read(captured!, "buffer")) as ArrayBuffer);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("writes a placeholder header for an empty export", async () => {
    expect(await csvOf([])).toBe("(empty)");
  });

  // QA-006 (P3): member-typed text (part names, request reasons, project names)
  // is exported verbatim, so a value starting with = + - @ runs as a formula when
  // an admin opens the sheet in Excel. Remove `.fails` once values are neutralised.
  it("exports formula-like values verbatim today (documents QA-006)", async () => {
    const text = await csvOf([{ name: "=1+1" }]);
    expect(text.split("\r\n")[1]).toBe("=1+1");
  });

  it.fails("neutralises spreadsheet formulas in member-typed values", async () => {
    const text = await csvOf([{ name: "=1+1" }]);
    expect(text.split("\r\n")[1].startsWith("=")).toBe(false);
  });
});
