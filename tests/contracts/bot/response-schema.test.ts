import { describe, expect, it } from "vitest";

import { isLegacyCardResponse, isTextResponse } from "./response-schema";

describe("Google Chat response schemas", () => {
  describe("text responses", () => {
    it("accepts a text payload without constraining its copy", () => {
      expect(isTextResponse({ text: "Syntetyczna odpowiedź" })).toBe(true);
      expect(isTextResponse({ text: "", metadata: { source: "fixture" } })).toBe(true);
    });

    it.each([null, [], {}, { text: 42 }, { message: "Brak pola text" }])(
      "rejects an invalid text payload: %j",
      (payload) => {
        expect(isTextResponse(payload)).toBe(false);
      },
    );
  });

  describe("legacy card responses", () => {
    it("accepts a synthetic /who card envelope", () => {
      const payload = {
        cards: [
          {
            header: {
              title: "Obecnie pracują",
              subtitle: "Syntetyczny zespół",
            },
            sections: [
              {
                header: "Biuro",
                widgets: [
                  {
                    keyValue: {
                      topLabel: "Osoba Testowa",
                      content: "Rola testowa",
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      expect(isLegacyCardResponse(payload)).toBe(true);
    });

    it.each([
      { cards: [] },
      { cards: [{}] },
      { cards: [{ header: { title: "Bez sekcji" }, sections: [] }] },
      { cards: [{ header: { title: "Pusta karta" }, sections: [{ widgets: [] }] }] },
      { cards: [{ header: {}, sections: [{ widgets: [{ textParagraph: { text: "Test" } }] }] }] },
      { cards: [{ header: { title: "Błędny widget" }, sections: [{ widgets: [null] }] }] },
    ])("rejects an incomplete card envelope: %j", (payload) => {
      expect(isLegacyCardResponse(payload)).toBe(false);
    });
  });
});
