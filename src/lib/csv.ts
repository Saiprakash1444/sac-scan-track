/**
 * Spreadsheet download without a library: CSV with a UTF-8 BOM opens directly
 * in Excel (names like "Résistance" and "×" stay intact) and imports cleanly
 * into Google Sheets via File → Import.
 */
export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ["(empty)"];
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
