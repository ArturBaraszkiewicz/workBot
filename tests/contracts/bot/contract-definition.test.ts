import { describe, expect, it } from "vitest";

import {
  BEHAVIOR_FIXTURES,
  COMMAND_ALIASES,
  OFFICE_FLAGS,
  PROTOTYPE_DEVIATIONS,
  RESPONSE_EXAMPLES,
  SYNTHETIC_USERS,
} from "./fixtures";
import { isLegacyCardResponse, isTextResponse } from "./response-schema";
import type { CommandFamily, ResponseSchema } from "./types";

const REQUIRED_FAMILIES: readonly CommandFamily[] = [
  "start",
  "stop",
  "break-start",
  "break-end",
  "office",
  "status",
  "who",
];

function duplicates(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("F-01 contract definition", () => {
  it("uses unique fixture and fully-qualified step IDs", () => {
    const fixtureIds = BEHAVIOR_FIXTURES.map((fixture) => fixture.id);
    const stepIds = BEHAVIOR_FIXTURES.flatMap((fixture) => fixture.steps.map((step) => `${fixture.id}/${step.id}`));

    expect(duplicates(fixtureIds)).toEqual([]);
    expect(duplicates(stepIds)).toEqual([]);
    expect(stepIds.length).toBeGreaterThan(0);
  });

  it("covers every required family and alias with an executable step", () => {
    expect(Object.keys(COMMAND_ALIASES).sort()).toEqual([...REQUIRED_FAMILIES].sort());

    const executableCommands = BEHAVIOR_FIXTURES.flatMap((fixture) =>
      fixture.steps.map((step) => `${step.command.family}:${step.command.alias}`),
    );

    for (const family of REQUIRED_FAMILIES) {
      for (const alias of COMMAND_ALIASES[family]) {
        expect(executableCommands).toContain(`${family}:${alias}`);
      }
    }

    expect(OFFICE_FLAGS).toEqual(["-b", "-biuro", "-o", "-office"]);
    for (const flag of OFFICE_FLAGS) {
      expect(
        BEHAVIOR_FIXTURES.some((fixture) =>
          fixture.steps.some((step) => step.command.family === "start" && step.command.arguments.includes(flag)),
        ),
      ).toBe(true);
    }
  });

  it("contains only internally consistent synthetic identities and state references", () => {
    const userIds = SYNTHETIC_USERS.map((user) => user.id);

    expect(duplicates(userIds)).toEqual([]);
    expect(new Set(SYNTHETIC_USERS.map((user) => user.displayName)).size).toBe(SYNTHETIC_USERS.length);

    for (const user of SYNTHETIC_USERS) {
      expect(user.id).toMatch(/^user-[a-z]+$/);
      expect(user.displayName).not.toMatch(/[@\\/]/);
      expect(user.team).toMatch(/^(Atlas|Bursztyn)$/);
      expect(user.role).toMatch(/^(FE|BE|QA|DO)$/);
    }

    for (const fixture of BEHAVIOR_FIXTURES) {
      const fixtureUserIds = new Set(fixture.users.map((user) => user.id));
      const referencedUserIds = [
        ...fixture.initialStates.map((state) => state.userId),
        ...fixture.steps.flatMap((step) => [
          step.actorId,
          ...step.expected.states.map((state) => state.userId),
          ...(step.expected.visibleUserIds ?? []),
        ]),
      ];

      expect(
        referencedUserIds.every((userId) => fixtureUserIds.has(userId)),
        fixture.id,
      ).toBe(true);
      expect(
        fixture.steps.every((step) => !Number.isNaN(Date.parse(step.now))),
        fixture.id,
      ).toBe(true);
    }
  });

  it("keeps response assertions schema-only and supplies valid examples", () => {
    const validators: Record<ResponseSchema, (value: unknown) => boolean> = {
      text: isTextResponse,
      "legacy-card": isLegacyCardResponse,
    };

    for (const schema of Object.keys(RESPONSE_EXAMPLES) as ResponseSchema[]) {
      expect(validators[schema](RESPONSE_EXAMPLES[schema]), schema).toBe(true);
    }

    const schemas = new Set(
      BEHAVIOR_FIXTURES.flatMap((fixture) => fixture.steps.map((step) => step.expected.responseSchema)),
    );
    expect(schemas).toEqual(new Set<ResponseSchema>(["text", "legacy-card"]));
  });

  it("classifies every intentional prototype deviation", () => {
    const requiredDeviationIds = [
      "who-current-workers-only",
      "announcement-input-only",
      "schema-only-responses",
      "clean-resume-state",
      "legacy-time-ordering",
    ];

    expect(PROTOTYPE_DEVIATIONS.map((deviation) => deviation.id).sort()).toEqual(requiredDeviationIds.sort());
    expect(
      PROTOTYPE_DEVIATIONS.every(
        (deviation) =>
          deviation.classification.length > 0 &&
          deviation.prototypeBehavior.length > 0 &&
          deviation.contractBehavior.length > 0 &&
          deviation.rationale.length > 0,
      ),
    ).toBe(true);
  });

  it("pins the explicit legacy-time and PRD /who scenarios", () => {
    const fixtureIds = new Set(BEHAVIOR_FIXTURES.map((fixture) => fixture.id));

    for (const requiredFixtureId of [
      "legacy-future-and-negative-time",
      "legacy-reversed-break",
      "time-token-policy",
      "who-company-wide-and-filters",
      "case-insensitive-routing",
      "resume-clears-finished-state",
      "status-open-break-keeps-elapsed-minutes",
    ]) {
      expect(fixtureIds.has(requiredFixtureId), requiredFixtureId).toBe(true);
    }

    const whoFixture = BEHAVIOR_FIXTURES.find((fixture) => fixture.id === "who-company-wide-and-filters");
    expect(whoFixture?.steps.find((step) => step.id === "all-active")?.expected.visibleUserIds).toEqual([
      "user-alfa",
      "user-beta",
      "user-gamma",
    ]);

    const openBreakStatus = BEHAVIOR_FIXTURES.find(
      (fixture) => fixture.id === "status-open-break-keeps-elapsed-minutes",
    );
    expect(openBreakStatus?.steps[0]?.expected.workedMinutes).toEqual({ "user-alfa": 120 });
  });
});
