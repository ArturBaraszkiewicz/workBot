# Weryfikowalny kontrakt zachowania bota — krótki plan

> Pełny plan: `context/changes/gate-product-routes/plan.md`

## Co i dlaczego

Zmiana `gate-product-routes` realizuje roadmapowe F-01 (`preserved-bot-contract`). Dostarczy wykonywalny kontrakt
pełnego dnia pracy i `/who`, aby rewrite bota nie zmienił krytycznych reguł czasu, znanych komend ani technicznego
formatu odpowiedzi Google Chat.

## Punkt wyjścia

Zachowanie referencyjne istnieje wyłącznie w dużym bundlu `app.js`; nowa aplikacja nie ma jeszcze bota ani testów.
Obecny lint wyczerpuje pamięć na bundlu, a następnie zatrzymuje się na 920 istniejących błędach CRLF.

## Pożądany stan końcowy

Vitest i CI uruchamiają samodzielny kontrakt w `tests/contracts/bot/`. Syntetyczne fixtures opisują komendy pełnego dnia
pracy, obliczenia minut, stany użytkownika oraz company-wide `/who` z filtrami, a współdzielony harness jest gotowy do
podłączenia przez S-04 i S-05.

## Kluczowe podjęte decyzje

| Decyzja          | Wybór                                    | Dlaczego                                                    |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Zakres komend    | Pełny dzień pracy + `/who` i aliasy      | Pokrywa FR-008 i FR-009 bez mieszania ankiet i raportów     |
| Odpowiedzi czatu | Tylko walidacja schematu                 | Chroni format techniczny bez kruchych snapshotów treści     |
| Błędy prototypu  | PRD-first, odstępstwa jawnie opisane     | Rewrite nie ma dziedziczyć przypadkowych defektów           |
| Weryfikacja      | Vitest + obowiązkowy krok CI             | Kontrakt ma być wykonywalny, nie tylko opisowy              |
| Czas             | Semantyka hosta prototypu                | Zachowuje `HH:MM` jako „dzisiaj” i brak kontroli kolejności |
| `/who`           | Aktywni w całej firmie + filtry          | Spełnia PRD i zachowuje znane filtry biuro/zespół/rola      |
| Ogłoszenie       | Punkt rozszerzenia dla S-04              | Stabilizuje kontrakt bez implementowania zależności         |
| Lint             | Ignorowanie `app.js` + `endOfLine: auto` | Przywraca bramkę bez masowej normalizacji plików            |

## Zakres

**W zakresie:**

- Vitest, `npm test` i testowa bramka CI.
- Schematy `{ text }` i legacy cards.
- `/start`, `/stop`, przerwy, `/office`, `/status`, `/who` i ich aliasy.
- Syntetyczne fixtures czasu, stanu, zespołów, ról i filtrów.
- Harness dla przyszłych adapterów S-04/S-05.
- Dokumentacja zachowanych reguł i świadomych odstępstw.
- Ograniczona naprawa lintowania i formatowania.

**Poza zakresem:**

- Endpoint Google Chat, Supabase, model domenowy i trwałe dane.
- Implementacja ogłoszeń, ankiet, raportów i automatycznego zamykania dnia.
- Migracja historycznych danych i prawdziwe dane pracowników.
- Pełna normalizacja LF, przebudowa ESLint/Astro i pozostałe zalecenia health-checka.

## Architektura / podejście

`app.js` i PRD są źródłami dowodów → syntetyczne fixtures definiują kontrakt → Vitest sprawdza spójność i schematy →
S-04/S-05 podłączają realny adapter do tego samego harnessu. Kontrakt nie importuje Astro, Supabase ani bundla.

## Fazy w skrócie

| Faza                   | Co dostarcza                                        | Kluczowe ryzyko                                    |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------- |
| 1. Bramki i schemat    | Vitest, CI, działający lint i walidatory odpowiedzi | `endOfLine: auto` nie ustanawia jednej polityki LF |
| 2. Kontrakt zachowania | Typy, fixtures, harness i dokumentację F-01         | Schema-only nie wykrywa błędnej treści odpowiedzi  |

**Wymagania wstępne:** Brak; F-01 jest oznaczone jako ready i nie ma blockerów.
**Szacowany wysiłek:** Dwie fazy implementacyjne; bez estymacji kalendarzowej w roadmapie.

## Otwarte ryzyka i założenia

- Kontrolowany zegar stabilizuje testy, ale zachowuje środowiskową semantykę „dzisiaj” oraz ujemne okresy.
- Harness stanie się dowodem zgodności produktu dopiero po podłączeniu adaptera w S-04/S-05.
- Bieżąca zgodność online formatu kart jest odpowiedzialnością F-03.
- `gate-product-routes` pozostaje ID workflow mimo aliasu `preserved-bot-contract` w roadmapie.

## Kryteria sukcesu — podsumowanie

- `npm test`, `npm run lint` i `npm run build` przechodzą, a CI wymusza test przed lintem i buildem.
- Kontrakt obejmuje wszystkie uzgodnione komendy, aliasy, reguły czasu oraz aktywny company-wide `/who` z filtrami.
- Fixtures są syntetyczne, odstępstwa od prototypu jawne, a S-04/S-05 mogą użyć harnessu bez zmiany kontraktu.
