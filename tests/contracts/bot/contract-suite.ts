import { describe, expect, it } from "vitest";

import { BEHAVIOR_FIXTURES } from "./fixtures";
import { isLegacyCardResponse, isTextResponse } from "./response-schema";
import type { BotContractAdapterFactory, ContractClock, ResponseSchema, WorkdayState } from "./types";

class MutableContractClock implements ContractClock {
  readonly #value = { current: new Date(0) };

  now(): Date {
    return new Date(this.#value.current);
  }

  set(now: Date): void {
    this.#value.current = new Date(now);
  }
}

function sortedStates(states: readonly WorkdayState[]): readonly WorkdayState[] {
  return [...states].sort((left, right) => left.userId.localeCompare(right.userId));
}

function expectResponseSchema(response: unknown, schema: ResponseSchema): void {
  if (schema === "text") {
    expect(isTextResponse(response)).toBe(true);
    return;
  }

  expect(isLegacyCardResponse(response)).toBe(true);
}

/**
 * Rejestruje cały kontrakt F-01 przeciwko adapterowi produktu.
 *
 * Każdy fixture otrzymuje nowy adapter i zegar. Implementacja może przechowywać stan
 * wyłącznie w pamięci; harness nie uruchamia sieci, systemu plików, Astro ani Supabase.
 */
export function registerBotContract(adapterFactory: BotContractAdapterFactory): void {
  describe("F-01 preserved bot contract", () => {
    for (const fixture of BEHAVIOR_FIXTURES) {
      it(fixture.description, async () => {
        const clock = new MutableContractClock();
        const adapter = await adapterFactory({
          users: fixture.users,
          initialStates: fixture.initialStates,
          clock,
        });

        for (const step of fixture.steps) {
          clock.set(new Date(step.now));

          const result = await adapter.execute({
            actorId: step.actorId,
            command: {
              alias: step.command.alias,
              arguments: step.command.arguments,
            },
            activeAnnouncement: step.activeAnnouncement,
          });

          expect(result.outcome, `${fixture.id}/${step.id}: outcome`).toBe(step.expected.outcome);
          expectResponseSchema(result.response, step.expected.responseSchema);
          expect(sortedStates(result.states), `${fixture.id}/${step.id}: state`).toEqual(
            sortedStates(step.expected.states),
          );

          if (step.expected.workedMinutes !== undefined) {
            expect(result.workedMinutes, `${fixture.id}/${step.id}: worked minutes`).toEqual(
              step.expected.workedMinutes,
            );
          }

          if (step.expected.visibleUserIds !== undefined) {
            expect(
              result.visibleUserIds === undefined ? undefined : [...result.visibleUserIds].sort(),
              `${fixture.id}/${step.id}: visible users`,
            ).toEqual([...step.expected.visibleUserIds].sort());
          }
        }
      });
    }
  });
}
