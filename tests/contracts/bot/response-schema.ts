type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isLegacyCardHeader(value: unknown): boolean {
  return isObject(value) && hasNonEmptyString(value.title);
}

function isLegacyCardWidget(value: unknown): boolean {
  return isObject(value) && Object.keys(value).length > 0;
}

function isLegacyCardSection(value: unknown): boolean {
  return (
    isObject(value) &&
    Array.isArray(value.widgets) &&
    value.widgets.length > 0 &&
    value.widgets.every(isLegacyCardWidget)
  );
}

function isLegacyCard(value: unknown): boolean {
  return (
    isObject(value) &&
    isLegacyCardHeader(value.header) &&
    Array.isArray(value.sections) &&
    value.sections.length > 0 &&
    value.sections.every(isLegacyCardSection)
  );
}

export function isTextResponse(value: unknown): value is { text: string } {
  return isObject(value) && typeof value.text === "string";
}

export function isLegacyCardResponse(value: unknown): boolean {
  return isObject(value) && Array.isArray(value.cards) && value.cards.length > 0 && value.cards.every(isLegacyCard);
}
