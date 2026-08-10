# Bezpieczna ścieżka podglądu bota — krótki plan

> Pełny plan: `context/changes/bot-preview-path/plan.md`

## Co i dlaczego

Budujemy minimalny produkcyjny callback Google Chat pod `POST /api/bot/google-chat`. Ma potwierdzić prawdziwy transport,
uwierzytelnienie Google, zgodny format `{ text: string }`, czas odpowiedzi i bezpieczne logi zanim późniejsze slice'y
dodadzą `/start`, `/who`, Supabase oraz logikę czasu pracy.

## Punkt wyjścia

Repozytorium ma Astro SSR na Cloudflare, kontrakt odpowiedzi bota i włączoną observability, ale nie ma endpointu bota,
weryfikacji żądań Google ani aplikacyjnych logów. Obecne middleware wykonuje panelowe zapytania Supabase dla każdego
requestu, więc callback wymaga osobnej szybkiej ścieżki.

## Pożądany stan końcowy

Google Chat wywołuje produkcyjnego Workera z podpisanym tokenem OIDC. Poprawne zdarzenie otrzymuje statyczny tekst,
`REMOVED_FROM_SPACE` kończy się `204`, błędne wejścia mają kontrolowane statusy, a callback nie dotyka Supabase.
Push do `main` wdraża automatycznie dopiero po zielonych bramkach; smoke potwierdza odpowiedź poniżej pięciu sekund,
zredagowane logi i gotowy rollback.

## Podjęte kluczowe decyzje

| Decyzja    | Wybór                                                     | Dlaczego                                                                          |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Cel online | Istniejący Worker produkcyjny                             | Użytkownik wybrał bezpośrednią docelową ścieżkę zamiast stagingu lub Preview URL. |
| Endpoint   | `POST /api/bot/google-chat`                               | Jedna stabilna trasa daje dokładny audience i nie miesza się z `/api/panel`.      |
| Auth       | Google OIDC, audience = dokładny URL                      | Kryptograficznie wiąże token z produkcyjnym callbackiem.                          |
| Zdarzenia  | Statyczny tekst dla odpowiedziowalnych; usunięcie → `204` | Daje szeroki smoke, respektując zakaz odpowiedzi po usunięciu bota.               |
| Wejście    | JSON do 256 KiB, tylko POST                               | Ogranicza koszt i daje jednoznaczne 405/413/415.                                  |
| Błędy auth | `401` invalid, `503` unavailable                          | Rozróżnia złe żądanie od awarii konfiguracji lub JWKS.                            |
| Logi       | Tylko request ID, event type, wynik, status, czas         | Wystarcza operacyjnie bez utrwalania tokenów, treści i PII.                       |
| Deploy     | Automatycznie po zielonym CI na `main`                    | Realizuje wybraną ścieżkę bez ręcznego publikowania kodu.                         |
| Akceptacja | Pełny produkcyjny smoke                                   | Sam build nie dowodzi integracji Google Chat ani czasu end-to-end.                |

## Zakres

**W zakresie:**

- kontrakt callbacka z testami oraz Google OIDC przez Worker-compatible `jose` i cache JWKS;
- server-only `GOOGLE_CHAT_AUDIENCE`, endpoint Astro, limit body i zredagowane logi;
- ominięcie panelowego Supabase wyłącznie dla dokładnej trasy callbacka;
- automatyczny deploy produkcyjny, runbook, smoke i rollback target.

**Poza zakresem:**

- komendy `/start`, `/who`, czas pracy, mapowanie pracownika i adapter produktu F-01;
- Supabase, migracje, ogłoszenia, ankiety i obecność;
- staging, Preview URL, kolejki, deduplikacja i asynchroniczne odpowiedzi;
- logowanie body, tokenów, wiadomości albo danych użytkownika.

## Architektura / podejście

`Google Chat → Google bearer OIDC → Astro endpoint → czysty handler → statyczny Message + bezpieczny log`.
Middleware rozpoznaje dokładną trasę callbacka przed utworzeniem klienta Supabase. Verifier używa modułowego cache JWKS,
a handler pozostaje niezależny od Google i Astro dzięki wstrzykiwanym adapterom.

## Fazy w skrócie

| Faza                          | Co dostarcza                                                    | Kluczowe ryzyko                                 |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| 1. Kontrakt callbacka i testy | Pełne zachowanie HTTP, auth, limitów, zdarzeń i logów bez sieci | Przypadkowe rozszerzenie F-03 o logikę domenową |
| 2. Astro i Google OIDC        | Produkcyjny verifier, endpoint, middleware bypass i runbook     | Błędny audience lub Access blokujący Google     |
| 3. Deploy i smoke             | Automatyczne wdrożenie po CI oraz dowód online <5 s i rollback  | Bezpośredni wpływ pierwszej wersji na produkcję |

**Wymagania wstępne:** dostęp do Google Chat, Cloudflare, GitHub secrets i dokładnego URL produkcyjnego.
**Szacowany wysiłek:** około 3 sesje implementacyjne w 3 fazach oraz osobna krótka sesja smoke po wdrożeniu.

## Otwarte ryzyka i założenia

- Produkcja jako pierwszy cel i automatyczny deploy są świadomie zaakceptowane; brak efektów ubocznych ogranicza ryzyko.
- Audience, GitHub secrets i Google Chat muszą istnieć przed merge; Access wymaga wąskiego wyjątku dla callbacka.

## Kryteria sukcesu — podsumowanie

- Prawdziwa wiadomość Google Chat otrzymuje zgodny tekst w czasie poniżej pięciu sekund.
- Niepoprawne żądania są odrzucane właściwym statusem, a callback nie wywołuje Supabase.
- Produkcyjne logi nie zawierają tokenów, payloadu ani PII, a poprzednia wersja Workera jest gotowa do rollbacku.
