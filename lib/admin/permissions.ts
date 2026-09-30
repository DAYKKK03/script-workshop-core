import type { AdminRole } from "@prisma/client";

export function canManageInvites(role: AdminRole) {
  return role === "OWNER" || role === "OPERATOR";
}

export function canManageAdmins(role: AdminRole) {
  return role === "OWNER";
}

export function canManageUserLimits(role: AdminRole) {
  return role === "OWNER";
}
