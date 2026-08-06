# Plan implementacji weryfikowalnego kontraktu zachowania bota

## Przegląd

Zmiana `gate-product-routes` realizuje element roadmapy F-01, którego kanonicznym aliasem backlogowym jest
`preserved-bot-contract`. Celem jest utworzenie wykonywalnego, niezależnego od docelowej implementacji kontraktu dla
pełnego dnia pracy i `/who`, aby przyszłe slice'y S-04 i S-05 mogły dowodzić zgodności z krytycznym zachowaniem
referencyjnego bota.

Kontrakt będzie oparty na Vitest, syntetycznych fixtures, kontrolowanym zegarze i współdzielonym harnessie. Stary
`app.js` pozostanie dowodem pochodzenia zachowania, ale nie będzie importowany ani uruchamiany w testach.

## Analiza stanu obecnego

Repozytorium jest szkieletem Astro/React z trasami uwierzytelniania, lecz bez implementacji bota, modelu czasu pracy i
test runnera. `package.json:5-12` nie zawiera skryptu testowego, a CI wykonuje tylko instalację, synchronizację Astro,
lint i build (`.github/workflows/ci.yml:18-24`). Referencyjny bundle zawiera czytelne sekcje źródłowe dla komend i
logiki czasu pracy, ale ma skutki uboczne: otwiera port, zapisuje pliki i zależy od lokalnego zegara
(`app.js:86743-86804`, `app.js:87403-87406`).

Obecna bramka lintowania jest niesprawna z dwóch niezależnych powodów. ESLint analizuje referencyjny bundle o
rozmiarze 3,35 MB i wyczerpuje pamięć, a zawartość `src/` generuje 920 istniejących błędów Prettiera dotyczących CRLF.
Uzgodniona, ograniczona naprawa wyklucza `app.js` z ESLint/Prettier oraz ustawia `endOfLine: "auto"`; nie normalizuje
całego repozytorium.

### Kluczowe odkrycia

- PRD wymaga zachowania znanych komend, poprawnego czasu pracy i zgodnego formatu odpowiedzi czatu
  (`context/foundation/prd.md:57-61`, `context/foundation/prd.md:107-110`).
- Czas pracy w prototypie to różnica start-koniec pomniejszona o zakończone przerwy, z dokładnością do pełnych minut
  (`app.js:86820-86840`).
- Router prototypu definiuje aliasy pełnego dnia pracy i `/who`, rozpoznaje komendy bez względu na wielkość liter i
  przyjmuje opcjonalny czas `HH:MM` (`app.js:87274-87327`).
- `/who` prototypu grupuje użytkowników i wspiera filtry biuro/zespół/rola, lecz pokazuje też osoby, które zakończyły
  pracę (`app.js:87200-87267`). PRD ma pierwszeństwo i wymaga wyłącznie obecnie pracujących w całej firmie.
- Odpowiedzi prostych komend używają `{ text }`, a `/who` używa legacy card envelope (`app.js:87295-87327`).
- `/start` nie ma działającego ogłoszenia HR; kontrakt ma jedynie zdefiniować punkt rozszerzenia, a integracja należy
  do S-04 (`context/foundation/roadmap.md:149-159`).
- Roadmapa wskazuje `preserved-bot-contract`, lecz użytkownik dwukrotnie wybrał stabilny change ID
  `gate-product-routes`; plan zachowuje ten folder i dokumentuje mapowanie, aby nie powstała druga zmiana.

## Pożądany stan końcowy

Repozytorium ma działający Vitest i obowiązkowy krok testowy w CI. W `tests/contracts/bot/` znajduje się samodzielny
kontrakt opisujący wejścia, oczekiwany stan domenowy i dozwolone schematy odpowiedzi dla `/start`, `/stop`, przerw,
`/office`, `/status`, `/who` i ich aliasów. Fixtures używają wyłącznie syntetycznych osób, zespołów i ról.

Kontrakt zachowuje wybraną semantykę czasu prototypu: `HH:MM` oznacza czas w bieżącym dniu środowiska, bez walidacji
kolejności i bez ochrony przed przyszłymi lub ujemnymi okresami. Harness kontroluje `now`, aby testy były powtarzalne,
ale nie zmienia zachowania produktu. Automatyczne asercje odpowiedzi sprawdzają wyłącznie schemat `{ text }` lub karty;
nie zamrażają treści, interpunkcji ani lokalnego formatu godzin.

## Czego NIE robimy

- Nie implementujemy endpointu Google Chat, trwałego modelu danych ani logiki domenowej produktu.
- Nie pobieramy ani nie zapisujemy ogłoszeń HR; definiujemy tylko punkt rozszerzenia dla S-04.
- Nie obejmujemy ankiet, `/help`, `/report`, automatycznego zamykania dnia ani zarządzania użytkownikami i zespołami.
- Nie importujemy ani nie wykonujemy `app.js` w testach i nie kopiujemy prawdziwych nazw pracowników do fixtures.
- Nie utrwalamy zakończonych pracowników w `/who`, pozostałości stanu po wznowieniu pracy, podwójnych jednostek w
  raporcie ani innych rozpoznanych defektów prototypu.
- Nie normalizujemy wszystkich plików do LF, nie przebudowujemy konfiguracji parsera Astro i nie wykonujemy pełnej
  naprawy health-checka.
- Nie migrujemy historycznych plików JSON i nie integrujemy systemu śledzenia zadań.

## Podejście do implementacji

Najpierw powstaje wiarygodna bramka: Vitest, testy schematów odpowiedzi, krok CI oraz ograniczona naprawa lintowania.
Następnie kontrakt zostanie rozszerzony o typy zdarzeń, fixtures zachowania i funkcję rejestrującą współdzielony zestaw
testów dla przyszłego adaptera. Dzięki temu F-01 weryfikuje własną spójność, a S-04/S-05 mogą podłączyć realną
implementację bez kopiowania przypadków testowych.

## Krytyczne szczegóły implementacji

`app.js` jest wyłącznie materiałem dowodowym: bezpośrednie uruchomienie otwiera listener i dotyka systemu plików.
Szczegółowa decyzja użytkownika o semantyce czasu ma pierwszeństwo przed ogólną polityką naprawiania błędów: przyszłe
czasy i odwrócona kolejność pozostają dozwolone w kontrakcie, ale inne jawnie wykluczone defekty nie są zachowywane.

## Phase 1: Bramki weryfikacyjne i schemat odpowiedzi

### Przegląd

Faza dodaje pierwszy runner testowy, stabilizuje istniejące bramki i tworzy minimalny, znaczący test schematów
odpowiedzi. Po fazie repozytorium ma przechodzić przez `npm test`, `npm run lint` i `npm run build` bez dotykania kodu
produktu.

### Wymagane zmiany

#### 1. Runner testowy i skrypty

**Plik**: `package.json`

**Cel**: Dodać Vitest jako pierwszą zależność testową i udostępnić deterministyczny skrypt używany lokalnie oraz w CI.

**Kontrakt**: Skrypt `test` uruchamia jednorazowe `vitest run`; Vitest jest zależnością deweloperską. Nie dodajemy
coverage ani osobnego trybu watch w ramach F-01.

**Plik**: `package-lock.json`

**Cel**: Zablokować dokładne wersje nowej zależności i zachować powtarzalność `npm ci`.

**Kontrakt**: Lockfile odpowiada `package.json` i jest wygenerowany przez npm bez ręcznej edycji wpisów zależności.

#### 2. Ograniczona naprawa lintowania i formatowania

**Plik**: `eslint.config.js`

**Cel**: Usunąć referencyjny bundle z aktywnej powierzchni lintowania, ponieważ nie jest kodem rozwijanym przez projekt
i obecnie wyczerpuje pamięć Node.

**Kontrakt**: Globalny ignore obejmuje wyłącznie główny `app.js`; nowe pliki TypeScript kontraktu nadal podlegają
pełnym regułom type-aware ESLint.

**Plik**: `.prettierignore`

**Cel**: Zapobiec przypadkowemu formatowaniu wielkiego bundla podczas pracy nad kontraktem.

**Kontrakt**: `app.js` jest wykluczony z Prettiera, ale pozostaje śledzony w Git i dostępny jako referencja.

**Plik**: `.prettierrc.json`

**Cel**: Pozwolić istniejącym CRLF i nowym plikom LF przejść przez tę samą bramkę bez masowej normalizacji.

**Kontrakt**: `endOfLine` ma wartość `auto`; pozostałe reguły formatowania nie zmieniają się.

#### 3. Schematy odpowiedzi Google Chat

**Plik**: `tests/contracts/bot/response-schema.ts`

**Cel**: Zdefiniować zależne wyłącznie od danych walidatory dla dwóch formatów odpowiedzi występujących w kontrakcie.

**Kontrakt**: Walidatory rozpoznają prosty payload `{ text: string }` oraz legacy card envelope z nagłówkiem, sekcjami i
widgetami. Nie sprawdzają dokładnej treści, interpunkcji, kolejności słów ani locale.

**Plik**: `tests/contracts/bot/response-schema.test.ts`

**Cel**: Udowodnić, że runner działa, a walidatory akceptują poprawne i odrzucają niepoprawne przykłady obu schematów.

**Kontrakt**: Testy zawierają syntetyczne przykłady `{ text }`, karty `/who`, pustej karty i błędnych payloadów; nie
importują `app.js`.

#### 4. Bramka CI

**Plik**: `.github/workflows/ci.yml`

**Cel**: Uniemożliwić scalenie zmiany, która łamie wykonywalny kontrakt.

**Kontrakt**: `npm test` działa po `npx astro sync`, a przed lintem i buildem. Istniejące triggery, Node 22 oraz sekrety
builda pozostają bez zmian.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Zablokowane zależności instalują się poprawnie: `npm ci`.
- Testy schematów odpowiedzi przechodzą: `npm test`.
- Aktywny kod i nowe testy przechodzą lint: `npm run lint`.
- Produkcyjny build Cloudflare przechodzi: `npm run build`.

#### Weryfikacja ręczna

- Kolejność CI to install → Astro sync → test → lint → build, bez usunięcia istniejących bramek.
- `app.js` pozostaje śledzony i czytelny, ale jest pomijany wyłącznie przez ESLint i Prettier.

**Uwaga implementacyjna**: Po zakończeniu fazy i automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie
zakresu zmian konfiguracyjnych przed przejściem do definicji zachowania.

---

## Phase 2: Wykonywalny kontrakt pełnego dnia pracy i `/who`

### Przegląd

Faza definiuje implementacyjnie niezależny kontrakt zdarzeń, stanów i przypadków zachowania. Kontrakt jest wykonywalny
jako zestaw walidacji własnych, a przyszłe slice'y mogą uruchomić te same przypadki przeciwko adapterowi produktu.

### Wymagane zmiany

#### 1. Tożsamość, pochodzenie i polityka zgodności

**Plik**: `tests/contracts/bot/README.md`

**Cel**: Zapisać granice F-01, źródła zachowania i świadome różnice, aby implementator nie traktował bundla jako
bezwzględnej specyfikacji.

**Kontrakt**: Dokument mapuje `gate-product-routes` na F-01 / `preserved-bot-contract`, wskazuje PRD jako nadrzędne
źródło, wylicza zachowane komendy oraz jawnie opisuje schemat-only payload checks, legacy time semantics, company-wide
`/who`, seam ogłoszenia i nieprzenoszone błędy prototypu.

#### 2. Typy zdarzeń, stanu i adaptera

**Plik**: `tests/contracts/bot/types.ts`

**Cel**: Ustalić minimalny, stabilny interfejs między fixtures a przyszłą implementacją bota.

**Kontrakt**: Typy obejmują syntetyczną tożsamość użytkownika, zespół/rolę, komendę z argumentami, kontrolowane `now`,
stan dnia pracy, oczekiwane minuty pracy, rodzaj schematu odpowiedzi oraz opcjonalny `activeAnnouncement`. Adapter nie
zakłada Astro, Supabase ani konkretnego magazynu danych.

#### 3. Macierz aliasów i fixtures zachowania

**Plik**: `tests/contracts/bot/fixtures.ts`

**Cel**: Zamrozić jednoznaczne przykłady wejść i oczekiwanych rezultatów dla zachowania objętego FR-008 i FR-009.

**Kontrakt**: Fixtures używają syntetycznych osób i obejmują:

- aliasy `/start`, `/rozpocznij`, `/hi`; `/stop`, `/koniec`, `/zakoncz`, `/bb`, `/end`, `/adios`;
  `/break`, `/przerwa`, `/zw`, `/brb`; `/endbreak`, `/koniecprzerwy`, `/jj`; `/office`, `/biuro`;
  `/status`; `/who`, `/kto`,
- start zdalny, start biurowy przez każdą wspieraną flagę, czas jawny i powtórny start,
- rozpoczęcie i zakończenie przerwy, zatrzymanie podczas otwartej przerwy, błędne przejścia stanu oraz pełny dzień z
  oczekiwanym wynikiem minutowym,
- zachowanie prototypu dla czasu: poprawne `HH:MM` jest osadzane w bieżącym dniu kontrolowanego zegara; przyszłe czasy,
  odwrócona kolejność i ujemny wynik nie są odrzucane; token niepasujący do wzorca jest ignorowany, a pasujący, lecz
  poza zakresem 00:00-23:59 daje błąd,
- `/who` domyślnie dla wszystkich obecnie pracujących oraz filtry biuro, zespół i rola; pracownicy zakończeni są
  wykluczeni, a stan przerwy nadal oznacza bieżącą pracę,
- przykłady schematu `{ text }` i karty bez przywiązywania asercji do dokładnej treści,
- opcjonalne ogłoszenie przekazane do `/start` jako seam dla S-04, bez implementacji pobierania danych.

#### 4. Współdzielony harness kontraktowy

**Plik**: `tests/contracts/bot/contract-suite.ts`

**Cel**: Udostępnić jedną funkcję rejestrującą przypadki kontraktowe dla adapterów tworzonych w S-04 i S-05.

**Kontrakt**: Harness przyjmuje fabrykę izolowanego adaptera oraz kontrolę zegara, wykonuje sekwencje fixtures i
porównuje stan/minuty pracy. Dla odpowiedzi czatu wywołuje wyłącznie wybrany walidator schematu. Nie uruchamia sieci,
Supabase, systemu plików ani `app.js`.

#### 5. Własna spójność definicji kontraktu

**Plik**: `tests/contracts/bot/contract-definition.test.ts`

**Cel**: Zapewnić, że F-01 jest zielony przed istnieniem implementacji produktu, bez tworzenia fałszywego bota-oracle.

**Kontrakt**: Testy weryfikują unikalność ID przypadków, kompletność wymaganych rodzin komend i aliasów, poprawność
syntetycznych fixtures, zgodność przykładów odpowiedzi ze schematami oraz obecność jawnej klasyfikacji każdego
odstępstwa od prototypu. Nie implementują logiki produktu tylko po to, aby testować ją przeciwko tym samym fixtures.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Definicja kontraktu, macierz aliasów i fixtures przechodzą: `npm test`.
- Typy harnessu i fixtures są poprawne: `npx tsc --noEmit`.
- Cały aktywny kod i kontrakt przechodzą lint: `npm run lint`.
- Produkcyjny build pozostaje zielony: `npm run build`.

#### Weryfikacja ręczna

- Macierz przypadków została porównana z PRD oraz `app.js:86820-87370`, a każda świadoma różnica jest opisana.
- Potwierdzono, że fixtures nie zawierają prawdziwych nazw, ścieżek serwerowych ani danych historycznych.
- Potwierdzono ograniczenie: automatyczne sprawdzanie payloadu wykrywa błędny schemat, ale nie błędną treść odpowiedzi.
- Potwierdzono, że S-04/S-05 mogą podłączyć adapter bez zmiany istniejących fixtures i bez zależności od Astro/Supabase.

**Uwaga implementacyjna**: Po automatycznej weryfikacji zatrzymaj się na ręczny przegląd macierzy zachowania. F-01 nie
jest ukończone, dopóki jawne odstępstwa od prototypu i ograniczenie schema-only nie zostaną zaakceptowane.

## Strategia testowania

### Testy jednostkowe

- Walidatory poprawnych i błędnych payloadów `{ text }` oraz legacy cards.
- Spójność fixtures, aliasów, kontrolowanego zegara i klasyfikacji odstępstw.
- Obliczenia oczekiwanych minut dla pełnego dnia, zakończonych i otwartych przerw oraz wybranych ujemnych okresów.

### Testy integracyjne

- F-01 dostarcza współdzielony harness, ale nie ma jeszcze adaptera produktu do testów integracyjnych.
- S-04 podłącza pierwszy adapter `/start` i seam ogłoszenia; S-05 rozszerza go na pełny dzień pracy.
- F-03 odpowiada za rzeczywistą weryfikację callbacka Google Chat i bieżącego formatu platformy.

### Kroki testowania ręcznego

1. Porównać każdą rodzinę komend i aliasów z routerem w `app.js:87274-87327`.
2. Porównać reguły czasu i przerw z `app.js:86820-86964`, zaznaczając świadomie zachowaną semantykę czasu.
3. Potwierdzić, że `/who` realizuje aktualny PRD, a nie historyczne zachowanie zakończonych użytkowników.
4. Sprawdzić, że przykładowe karty odpowiadają wybranemu schematowi, bez wymagania dokładnej treści.
5. Sprawdzić, że README nie sugeruje implementacji endpointu, bazy danych ani ogłoszeń w F-01.

## Uwagi dotyczące wydajności

Kontrakt działa w pamięci na małej, stałej liczbie syntetycznych przypadków. `app.js` jest wyłączony z lintowania i
formatowania, więc dodanie testów nie może ponownie wprowadzić obecnego problemu pamięciowego. Nie definiujemy tutaj
testu pięciosekundowego SLA; ścieżka online należy do F-03/S-04.

## Uwagi dotyczące migracji

Nie ma migracji danych ani zmian schematu Supabase. Stabilny folder `gate-product-routes` pozostaje tożsamością workflow,
a dokumentacja kontraktu zapisuje jego mapowanie na roadmapowe F-01 / `preserved-bot-contract`.

## Otwarte ryzyka i założenia

- Schema-only payload checks nie wykryją poprawnego kształtu z błędną treścią; jest to świadomie zaakceptowany wybór.
- Semantyka „dzisiaj według środowiska” pozwala na przyszłe i ujemne okresy; kontrolowany zegar stabilizuje testy, ale
  nie naprawia tej polityki.
- `endOfLine: "auto"` przywraca bramkę bez dużego diffu, lecz nie ustanawia jednolitej polityki LF.
- Harness nie dowodzi jeszcze zgodności kodu produktu; stanie się testem implementacji dopiero po podłączeniu adaptera
  w S-04/S-05.
- Format kart pochodzi z referencyjnego bundla; zgodność z bieżącą platformą online pozostaje odpowiedzialnością F-03.

Żaden z powyższych punktów nie jest otwartym pytaniem; są to zaakceptowane ograniczenia planu.

## References

- Tożsamość zmiany: `context/changes/gate-product-routes/change.md`
- Roadmapa F-01 i handoff: `context/foundation/roadmap.md:70-81`, `context/foundation/roadmap.md:247-250`
- Guardrails i kryteria US-01: `context/foundation/prd.md:57-77`
- FR-008/FR-009 i logika czasu: `context/foundation/prd.md:107-110`, `context/foundation/prd.md:131-137`
- Stan testów i rekomendacja Vitest: `context/foundation/health-check.md:80-103`,
  `context/foundation/health-check.md:154-182`
- Obliczenia czasu i stan dnia: `app.js:86742-86964`
- Komendy `/start`, `/status`, `/who`: `app.js:87125-87267`
- Router i odpowiedzi callbacka: `app.js:87274-87370`
- Obecne skrypty i CI: `package.json:5-12`, `.github/workflows/ci.yml:18-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bramki weryfikacyjne i schemat odpowiedzi

#### Automated

- [x] 1.1 Zależności instalują się przez npm ci — 6c02936
- [x] 1.2 Testy schematów odpowiedzi przechodzą — 6c02936
- [x] 1.3 Lint aktywnego kodu i testów przechodzi — 6c02936
- [x] 1.4 Produkcyjny build Cloudflare przechodzi — 6c02936

#### Manual

- [x] 1.5 Kolejność bramek CI jest poprawna — 6c02936
- [x] 1.6 app.js pozostaje śledzoną, lecz wykluczoną referencją — 6c02936

### Phase 2: Wykonywalny kontrakt pełnego dnia pracy i /who

#### Automated

- [x] 2.1 Definicja kontraktu, aliasy i fixtures przechodzą testy — 1a16575
- [x] 2.2 Typy harnessu i fixtures przechodzą tsc — 1a16575
- [x] 2.3 Cały aktywny kod i kontrakt przechodzą lint — 1a16575
- [x] 2.4 Produkcyjny build pozostaje zielony — 1a16575

#### Manual

- [x] 2.5 Macierz zachowania i odstępstw została porównana z PRD i app.js — 1a16575
- [x] 2.6 Fixtures nie zawierają danych rzeczywistych — 1a16575
- [x] 2.7 Ograniczenie schema-only zostało zaakceptowane — 1a16575
- [x] 2.8 Adapter S-04/S-05 może użyć kontraktu bez zależności produktowych — 1a16575
