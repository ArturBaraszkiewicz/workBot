<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Weryfikowalny kontrakt zachowania bota

- **Plan**: `context/changes/gate-product-routes/plan.md`
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-08-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
| --- | --- |
| Plan Adherence | FAIL |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Wymagany README nie jest śledzony w Git

- **Severity**: ⚠️ WARNING
- **Impact**: 🟢 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Plan Adherence
- **Location**: `tests/contracts/bot/README.md:1`
- **Detail**: Plan wymaga dokumentacji kontraktu, a lokalna treść odpowiada wymaganiom, lecz plik ma status `??` i nie występuje w commitach `6c02936` ani `1a16575`. Jednocześnie wszystkie punkty Fazy 2 wskazują commit `1a16575`, więc historia Git nie zawiera kompletnego rezultatu deklarowanego przez plan. Plik może zostać pominięty w PR albo utracony przed archiwizacją.
- **Fix**: Dodać `tests/contracts/bot/README.md` do śledzenia i osobnego commitu dokumentacyjnego przed archiwizacją.
- **Decision**: FIXED — plik zapisany w commicie `f6c753c`.

### F2 — Nieplanowana zmiana tożsamości Workera nie ma ścieżki migracji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔴 HIGH — stawka architektoniczna; należy dokładnie przemyśleć decyzję
- **Dimension**: Scope Discipline
- **Location**: `wrangler.jsonc:3`
- **Detail**: Faza 2 zmieniła nazwę Cloudflare Workera z `10x-astro-starter` na `workbot`, mimo że `wrangler.jsonc` nie występuje w planie. Zmiana nazwy może skierować wdrożenie do innego zasobu; sekrety, routes/custom domains, historia wdrożeń i rollback starego Workera nie migrują automatycznie. Review nie ma dostępu do rzeczywistego stanu konta Cloudflare.
- **Fix A ⭐ Recommended**: Przenieść zmianę nazwy do osobnej zmiany infrastrukturalnej z kontrolą istniejącego Workera, konfiguracją sekretów/routes, smoke testem i oknem rollbacku.
  - Strength: Oddziela kontrakt testowy od zmiany zasobu produkcyjnego i pozwala zweryfikować stan Cloudflare.
  - Tradeoff: Wymaga dodatkowego kroku i może opóźnić zmianę nazwy.
  - Confidence: HIGH — nazwa w konfiguracji jest identyfikatorem wdrażanego Workera.
  - Blind spot: Nie zweryfikowano, czy Worker `10x-astro-starter` był kiedykolwiek wdrożony.
- **Fix B**: Pozostawić zmianę w tym zakresie, ale dopisać addendum do planu i instrukcję migracji przed pierwszym deployem.
  - Strength: Zachowuje już wykonany rename i dokumentuje jego konsekwencje.
  - Tradeoff: Rozszerza zakres F-01 o odpowiedzialność infrastrukturalną niezwiązaną z kontraktem bota.
  - Confidence: MEDIUM — bezpieczeństwo zależy od faktycznego stanu zasobów i sekretów Cloudflare.
  - Blind spot: Brak dostępu do konfiguracji zdalnego środowiska.
- **Decision**: ACCEPTED — `workbot` jest kanoniczną nazwą Workera; dalsza konfiguracja ma używać tej nazwy. Ryzyko migracji z ewentualnego wcześniejszego zasobu zaakceptowane do obsługi przy deployu.

### F3 — Walidator legacy card akceptuje nieznane widgety

- **Severity**: ⚠️ WARNING
- **Impact**: 🟢 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality
- **Location**: `tests/contracts/bot/response-schema.ts:15`
- **Detail**: `isLegacyCardWidget()` uznaje każdy niepusty obiekt za poprawny widget. Payload zawierający `{ bogus: true }` przejdzie walidację, mimo że F-01 ma chronić techniczny format odpowiedzi Google Chat. Obecny negatywny test odrzuca `null`, ale nie odrzuca nieznanego typu widgetu.
- **Fix**: Walidować co najmniej używane warianty `keyValue` i `textParagraph` wraz z wymaganymi polami oraz dodać negatywny test nieznanego widgetu.
- **Decision**: SKIPPED — obecny liberalny walidator widgetów pozostaje bez zmian na tym etapie.

### F4 — Kontrakt czasu ukrycie zakłada offset `+02:00`

- **Severity**: ⚠️ WARNING
- **Impact**: 🟡 MEDIUM — prawdziwy kompromis; warto zatrzymać się i przemyśleć rozwiązanie
- **Dimension**: Architecture
- **Location**: `tests/contracts/bot/fixtures.ts:30`
- **Detail**: Wszystkie oczekiwane timestampy mają stały offset `+02:00`, natomiast adapter dostaje tylko obiekt `Date` i nie otrzymuje kontraktowej strefy czasowej. Implementacja zachowująca prototypowe `setHours()` użyje lokalnej strefy procesu; na CI działającym w UTC ten sam `HH:MM` może wskazywać inny moment lub dzień niż fixture. Problem będzie szczególnie widoczny na granicy dnia i podczas zmiany czasu.
- **Fix**: Uczynić strefę czasową jawną częścią `BotContractAdapterContext`, generować oczekiwane czasy przez wspólny helper i dodać przypadek granicy dnia/DST.
  - Strength: Kontrakt pozostaje deterministyczny na komputerze dewelopera i w CI.
  - Tradeoff: Poszerza interfejs adaptera i wymaga jednoznacznej decyzji produktowej o strefie.
  - Confidence: HIGH — `Date` interpretuje lokalne operacje czasowe według strefy procesu, a fixtures kodują konkretny offset.
  - Blind spot: Docelowa strefa środowiska produkcyjnego nie została jeszcze ustalona.
- **Decision**: SKIPPED — decyzja o jawnej strefie czasowej została odroczona do implementacji adaptera produktu.

### F5 — `wrangler.jsonc` nie spełnia formatowania repozytorium

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🟢 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Pattern Consistency
- **Location**: `wrangler.jsonc:2`
- **Detail**: Plik został przeformatowany na tabulatory i nie ma końcowego znaku nowej linii. `npx prettier --check 'wrangler.jsonc' 'tests/contracts/bot/**/*.{ts,md}'` kończy się kodem 1 i wskazuje wyłącznie `wrangler.jsonc`; lokalne reguły wymagają dwóch spacji i formatowania Prettierem.
- **Fix**: Uruchomić `npx prettier --write wrangler.jsonc` i zatwierdzić wyłącznie mechaniczny diff formatowania.
- **Decision**: SKIPPED — format `wrangler.jsonc` pozostaje bez zmian, ponieważ nie wpływa na działanie konfiguracji.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | 794 pakiety zainstalowane; audit nadal raportuje znane 22 podatności zależności bazowych |
| `npm test` | PASS | 2 pliki testowe, 19/19 testów |
| `npx tsc --noEmit` | PASS | exit 0 |
| `npm run lint` | PASS | exit 0; istniejące ostrzeżenia `astro-eslint-parser` o `projectService` |
| `npm run build` | PASS | Cloudflare server build zakończony; istniejące ostrzeżenie sitemap o braku `site` |
| Ręczne kryteria Fazy 1 | COMPLETE | kolejność CI i ignorowanie `app.js` są widoczne w diffie `6c02936` |
| Ręczne kryteria Fazy 2 | COMPLETE | oznaczone w Progress po potwierdzeniu użytkownika; fixtures i interfejs adaptera dostarczają widocznych dowodów |

## Accepted Plan Limitations

- `registerBotContract()` nie jest jeszcze uruchamiany przeciwko adapterowi produktu; obecne 19 testów dowodzi spójności definicji i schematów. Jest to zgodne z F-01, a S-04/S-05 muszą zarejestrować suite dla realnego adaptera.
- Odpowiedzi pozostają sprawdzane schema-only. `visibleUserIds` dowodzi selekcji domenowej `/who`, ale nie gwarantuje, że te same osoby zostały poprawnie wyrenderowane w treści karty. Ograniczenie zostało jawnie zaakceptowane w punkcie 2.7.
- Audit zależności zgłasza 1 critical, 12 high, 7 moderate i 2 low; stan był już opisany w `context/foundation/health-check.md` i nie został wprowadzony przez Fazę 2.

## Triage Summary

- **Fixed**: F1 — kontraktowy README zapisany w commicie `f6c753c`.
- **Accepted**: F2 — `workbot` jest kanoniczną nazwą Workera.
- **Skipped**: F3 — liberalny walidator widgetów pozostaje bez zmian.
- **Skipped**: F4 — jawna strefa czasowa została odroczona do implementacji adaptera.
- **Skipped**: F5 — formatowanie `wrangler.jsonc` pozostaje bez zmian.
