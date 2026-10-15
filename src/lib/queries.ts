import { queryOptions } from "@tanstack/react-query";
import {
  getAdditionsMode,
  getCountingMode,
  getBorrowLog,
  getInventory,
  getMe,
  getMyRequests,
  getMySubmissions,
  getNotifications,
} from "./inventory.functions";

export const inventoryQuery = () =>
  queryOptions({
    queryKey: ["inventory"],
    queryFn: () => getInventory(),
  });

export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: () => getMe(),
  });

export const borrowLogQuery = (scope: "mine" | "all", openOnly = false) =>
  queryOptions({
    queryKey: ["borrows", scope, openOnly],
    queryFn: () => getBorrowLog({ data: { scope, openOnly } }),
  });

export const notificationsQuery = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    refetchInterval: 5 * 60 * 1000,
  });

export const additionsModeQuery = () =>
  queryOptions({
    queryKey: ["additions-mode"],
    queryFn: () => getAdditionsMode(),
  });

export const mySubmissionsQuery = () =>
  queryOptions({
    queryKey: ["my-submissions"],
    queryFn: () => getMySubmissions(),
  });

export const countingModeQuery = () =>
  queryOptions({
    queryKey: ["counting-mode"],
    queryFn: () => getCountingMode(),
    staleTime: 60_000,
  });

export const myRequestsQuery = () =>
  queryOptions({
    queryKey: ["my-requests"],
    queryFn: () => getMyRequests(),
  });

/** Spreadsheet imports store the shelf row ("Row 2", "Ground"); older parts store a bin code. */
export function binText(bin: string | null) {
  if (!bin) return "";
  return /^(row|ground)/i.test(bin) ? bin : `bin ${bin}`;
}

/** "Project: Robocon bot" or "Personal" — how a loan was logged. */
export function purposeLabel(loan: { purpose: string; project_name: string | null }) {
  return loan.purpose === "project" ? `Project: ${loan.project_name ?? "—"}` : "Personal";
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Seed racks are named "Rack 1 - Microcontrollers"; the code is shown separately. */
export function sectionTitle(name: string) {
  return name.replace(/^Rack \d+\s*[-–]\s*/, "");
}
