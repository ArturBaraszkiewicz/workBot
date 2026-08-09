import { describe, expect, it } from "vitest";

import {
  PANEL_CAPABILITIES,
  canUsePanelCapability,
  createPanelPrincipal,
  type PanelCapability,
} from "../../../src/lib/auth/panel-access";

const USER_ID = "user-panel-test";
const TEAM_ATLAS = "team-atlas";
const TEAM_BURSZTYN = "team-bursztyn";

function activeGrant(role: unknown, assignedTeamIds?: readonly string[]) {
  return {
    userId: USER_ID,
    role,
    active: true,
    assignedTeamIds,
  };
}

describe("panel access contract", () => {
  describe("principal creation", () => {
    it("denies anonymous and authenticated users without a provisioned grant", () => {
      expect(createPanelPrincipal(null)).toBeNull();
      expect(createPanelPrincipal(undefined)).toBeNull();
    });

    it("denies inactive grants and unknown roles", () => {
      expect(createPanelPrincipal({ ...activeGrant("hr_admin"), active: false })).toBeNull();
      expect(createPanelPrincipal(activeGrant("employee"))).toBeNull();
    });

    it("creates a canonical HR/Admin principal without a team scope", () => {
      expect(createPanelPrincipal(activeGrant("hr_admin", [TEAM_ATLAS]))).toEqual({
        userId: USER_ID,
        role: "hr_admin",
      });
    });

    it("creates a PM principal with an explicit, default-empty team scope", () => {
      expect(createPanelPrincipal(activeGrant("pm"))).toEqual({
        userId: USER_ID,
        role: "pm",
        assignedTeamIds: [],
      });
      expect(createPanelPrincipal(activeGrant("pm", [TEAM_ATLAS, TEAM_BURSZTYN]))).toEqual({
        userId: USER_ID,
        role: "pm",
        assignedTeamIds: [TEAM_ATLAS, TEAM_BURSZTYN],
      });
    });
  });

  describe("capability matrix", () => {
    it("allows HR/Admin to use every declared panel capability", () => {
      const principal = createPanelPrincipal(activeGrant("hr_admin"));

      for (const capability of PANEL_CAPABILITIES) {
        expect(canUsePanelCapability(principal, capability), capability).toBe(true);
      }
    });

    it("allows a PM to read statistics only for an assigned team", () => {
      const principal = createPanelPrincipal(activeGrant("pm", [TEAM_ATLAS, TEAM_BURSZTYN]));

      expect(canUsePanelCapability(principal, "statistics:read", { teamId: TEAM_ATLAS })).toBe(true);
      expect(canUsePanelCapability(principal, "statistics:read", { teamId: TEAM_BURSZTYN })).toBe(true);
      expect(canUsePanelCapability(principal, "statistics:read", { teamId: "team-foreign" })).toBe(false);
      expect(canUsePanelCapability(principal, "statistics:read")).toBe(false);
    });

    it("gives a PM with no assigned teams access to no statistics", () => {
      const principal = createPanelPrincipal(activeGrant("pm"));

      expect(canUsePanelCapability(principal, "statistics:read", { teamId: TEAM_ATLAS })).toBe(false);
    });

    it("denies every mutation capability to a PM", () => {
      const principal = createPanelPrincipal(activeGrant("pm", [TEAM_ATLAS]));
      const mutationCapabilities: readonly PanelCapability[] = PANEL_CAPABILITIES.filter(
        (capability) => capability !== "statistics:read",
      );

      for (const capability of mutationCapabilities) {
        expect(canUsePanelCapability(principal, capability, { teamId: TEAM_ATLAS }), capability).toBe(false);
      }
    });

    it("denies missing principals and capabilities outside the closed set", () => {
      const principal = createPanelPrincipal(activeGrant("hr_admin"));

      expect(canUsePanelCapability(null, "statistics:read", { teamId: TEAM_ATLAS })).toBe(false);
      expect(canUsePanelCapability(principal, "statistics:write", { teamId: TEAM_ATLAS })).toBe(false);
    });

    it("denies a runtime principal with an unknown role", () => {
      const unknownPrincipal = {
        userId: USER_ID,
        role: "owner",
        assignedTeamIds: [TEAM_ATLAS],
      };

      expect(canUsePanelCapability(unknownPrincipal, "statistics:read", { teamId: TEAM_ATLAS })).toBe(false);
    });
  });
});
