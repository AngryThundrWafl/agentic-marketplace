import fs from "node:fs";
import path from "node:path";

export const REQUIRED_CANONICAL_PERMISSIONS = [
  "read-only",
  "restricted-shell",
  "approval-required",
  "tool-exclusion",
  "auth-required",
] as const;

export interface PermissionRow {
  canonical: string;
  privilegeLevel: number;
  nativeMapping: string;
}

export function verifyPermissionMatrix(permissionsMdPath: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!fs.existsSync(permissionsMdPath)) {
    return { ok: false, errors: [`Missing permissions.md at ${permissionsMdPath}`] };
  }

  const lines = fs.readFileSync(permissionsMdPath, "utf8").split(/\r?\n/);
  const rows: PermissionRow[] = [];

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    const first = cells[0]?.replace(/`/g, "") ?? "";
    if (!REQUIRED_CANONICAL_PERMISSIONS.includes(first as (typeof REQUIRED_CANONICAL_PERMISSIONS)[number])) {
      continue;
    }
    const levelCell = cells.length >= 4 ? Number(cells[1]) : NaN;
    const nativeCell = cells.length >= 4 ? (cells[2] ?? "") : (cells[1] ?? "");
    rows.push({
      canonical: first,
      privilegeLevel: Number.isFinite(levelCell) ? levelCell : 0,
      nativeMapping: nativeCell,
    });
  }

  const seen = new Set(rows.map((r) => r.canonical));
  for (const req of REQUIRED_CANONICAL_PERMISSIONS) {
    if (!seen.has(req)) {
      errors.push(`Permission matrix ${permissionsMdPath} is missing required row "${req}"`);
    }
  }

  // Check that two distinct privilege levels do not collapse to the same non-fail-closed native mapping
  const byNative = new Map<string, PermissionRow[]>();
  for (const row of rows) {
    if (row.nativeMapping.toLowerCase().includes("fail closed")) continue;
    const list = byNative.get(row.nativeMapping) ?? [];
    list.push(row);
    byNative.set(row.nativeMapping, list);
  }
  for (const [nativeMapping, grouped] of byNative.entries()) {
    const levels = new Set(grouped.map((g) => g.privilegeLevel).filter((l) => l > 0));
    if (levels.size > 1) {
      errors.push(
        `Permission escalation in ${permissionsMdPath}: distinct privilege levels map to "${nativeMapping}"`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
