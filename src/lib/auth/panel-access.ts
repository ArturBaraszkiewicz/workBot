export const PANEL_ROLES = ["hr_admin", "pm"] as const;

export type PanelRole = (typeof PANEL_ROLES)[number];

export const PANEL_CAPABILITIES = [
  "employees:manage",
  "teams:manage",
  "work-time:manage",
  "presence:manage",
  "leave:manage",
  "polls:manage",
  "announcements:manage",
  "statistics:read",
] as const;

export type PanelCapability = (typeof PANEL_CAPABILITIES)[number];

export interface HrAdminPrincipal {
  readonly userId: string;
  readonly role: "hr_admin";
}

export interface PmPrincipal {
  readonly userId: string;
  readonly role: "pm";
  readonly assignedTeamIds: readonly string[];
}

export type PanelPrincipal = HrAdminPrincipal | PmPrincipal;

export interface PanelGrant {
  readonly userId: string;
  readonly role: unknown;
  readonly active: boolean;
  readonly assignedTeamIds?: readonly string[];
}

export interface PanelCapabilityTarget {
  readonly teamId?: string;
}

const PANEL_ROLE_SET = new Set<string>(PANEL_ROLES);
const PANEL_CAPABILITY_SET = new Set<string>(PANEL_CAPABILITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPanelRole(value: unknown): value is PanelRole {
  return typeof value === "string" && PANEL_ROLE_SET.has(value);
}

export function isPanelCapability(value: unknown): value is PanelCapability {
  return typeof value === "string" && PANEL_CAPABILITY_SET.has(value);
}

export function isPanelPrincipal(value: unknown): value is PanelPrincipal {
  if (!isRecord(value) || typeof value.userId !== "string" || value.userId.length === 0 || !isPanelRole(value.role)) {
    return false;
  }

  return (
    value.role === "hr_admin" ||
    (Array.isArray(value.assignedTeamIds) &&
      value.assignedTeamIds.every((teamId: unknown) => typeof teamId === "string"))
  );
}

export function createPanelPrincipal(grant: PanelGrant | null | undefined): PanelPrincipal | null {
  if (grant === null || grant === undefined || !grant.active || grant.userId.length === 0 || !isPanelRole(grant.role)) {
    return null;
  }

  if (grant.role === "hr_admin") {
    return {
      userId: grant.userId,
      role: grant.role,
    };
  }

  return {
    userId: grant.userId,
    role: grant.role,
    assignedTeamIds: grant.assignedTeamIds ?? [],
  };
}

export function canUsePanelCapability(
  principal: unknown,
  capability: unknown,
  target: PanelCapabilityTarget = {},
): boolean {
  if (!isPanelPrincipal(principal) || !isPanelCapability(capability)) {
    return false;
  }

  if (principal.role === "hr_admin") {
    return true;
  }

  if (capability !== "statistics:read" || target.teamId === undefined) {
    return false;
  }

  return principal.assignedTeamIds.includes(target.teamId);
}
