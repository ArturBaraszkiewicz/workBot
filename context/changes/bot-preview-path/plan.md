# Plan implementacji bezpiecznej ścieżki podglądu bota

## Przegląd

Zmiana `bot-preview-path` realizuje roadmapowe F-03. Dostarcza minimalny, bezstanowy callback Google Chat pod
`POST /api/bot/google-chat`, wdrażany na produkcyjnego Cloudflare Workera i zabezpieczony podpisanym przez Google tokenem
OIDC. Callback nie wykonuje jeszcze komend ani operacji domenowych. Po poprawnej weryfikacji zwraca statyczny komunikat
`{ text: string }`, dzięki czemu można sprawdzić rzeczywisty transport, format odpowiedzi, opóźnienie i logi przed
budową `/start`, `/who` oraz zapisu czasu pracy.

Każde żądanie kończy się bezpieczną, jednoznaczną odpowiedzią i jednym zredagowanym wpisem logu. Produkcyjny deploy
następuje automatycznie po przejściu bramek CI na `main`, a zakończenie F-03 wymaga ręcznego smoke testu w Google Chat,
potwierdzenia odpowiedzi poniżej pięciu sekund oraz wskazania wersji do rollbacku.

## Analiza bieżącego stanu

Repozytorium nie ma aktywnego endpointu bota ani adaptera produktu. Pod `src/pages/api/` istnieją wyłącznie trasy
uwierzytelniania panelu, natomiast wykonywalny kontrakt F-01 jest celowo odizolowany od Astro, sieci, Supabase i
środowiska produkcyjnego (`tests/contracts/bot/README.md:21-23`, `tests/contracts/bot/contract-suite.ts:32-38`).
Walidator odpowiedzi potwierdza, że minimalny payload `{ text: string }` jest zgodny z przyjętym kontraktem Google Chat
(`tests/contracts/bot/response-schema.ts:38-43`).

Obecne middleware rozwiązuje sesję Supabase i grant panelowy przed klasyfikacją każdej trasy
(`src/middleware.ts:22-40`). Nowy callback byłby formalnie publiczny, ale nadal czekałby na zewnętrzne wywołania Supabase,
co niepotrzebnie wiązałoby jego dostępność i opóźnienie z panelem. Nie można dodać callbacka do `/api/panel`, ponieważ
tamta granica wymaga przeglądarkowej sesji Supabase, podczas gdy pracownik korzysta z tożsamości dostarczonej przez
Google Chat (`src/lib/auth/route-access.ts:1-6`, `context/foundation/prd.md:139-147`).

Cloudflare observability jest włączone, ale aplikacja nie emituje ustrukturyzowanych logów callbacka
(`wrangler.jsonc:14-16`). CI uruchamia testy, pgTAP, lint i build, lecz nie wdraża Workera
(`.github/workflows/ci.yml:9-37`). Produkcyjny runbook zabrania logowania tokenów i surowych błędów dostawców
(`docs/deployment-cloudflare-supabase.md:169-173`).

## Pożądany stan końcowy

Google Chat wysyła żądanie HTTPS do `POST /api/bot/google-chat` z bearer tokenem. Worker weryfikuje podpis RS256 przez
Google JWKS, issuer, termin ważności, dokładny audience równy produkcyjnemu URL callbacka oraz tożsamość
`chat@system.gserviceaccount.com`. Brak lub niepoprawny token daje `401`; brak konfiguracji lub chwilowa niedostępność
JWKS daje `503`. Weryfikacja odbywa się przed parsowaniem body.

Po uwierzytelnieniu endpoint przyjmuje wyłącznie JSON o rozmiarze do 256 KiB. Poprawne zdarzenia zwracają statyczny
payload tekstowy, z wyjątkiem `REMOVED_FROM_SPACE`, które zgodnie z protokołem kończy się `204`. Każda odpowiedź ma
`Cache-Control: no-store`. Callback omija rozwiązywanie sesji panelowej i nie dotyka Supabase.

Push do `main` uruchamia dotychczasowe bramki, a dopiero po ich sukcesie automatycznie buduje i wdraża pełnego Workera.
Job używa ograniczonych sekretów GitHub, zapisuje poprzednią i nową wersję wdrożenia, a awaria nie może udawać sukcesu.
Prawdziwa wiadomość Google Chat otrzymuje odpowiedź w czasie poniżej pięciu sekund, log produkcyjny zawiera tylko
dozwolone metadane, a operator ma konkretny identyfikator poprzedniej wersji do rollbacku.

### Kluczowe odkrycia

- Google Chat dołącza bearer token do każdego wywołania HTTPS; własny endpoint musi zweryfikować token i zwrócić `401`
  przy niepowodzeniu.
- Dla audience typu HTTP endpoint token jest Google-signed OIDC ID tokenem, a `aud` odpowiada dokładnemu URL
  skonfigurowanemu w Google Chat.
- `jose` jest bezstanową biblioteką ESM zgodną z Cloudflare Workers i pozwala utrzymać resolver zdalnego JWKS w cache
  modułu zamiast pobierać klucze dla każdego requestu.
- Google może ponawiać nieudane dostarczenie; statyczny callback F-03 nie ma efektów ubocznych, więc jest naturalnie
  idempotentny. Deduplikacja przyszłych zapisów należy do S-04 i kolejnych slice'ów.
- Google Chat nie pozwala zwrócić obiektu `Message` dla `REMOVED_FROM_SPACE`; ta jedna ścieżka musi zakończyć się `204`.
- Nazwa Workera `workbot` jest już kanoniczna i nie będzie ponownie zmieniana (`wrangler.jsonc:3`).

## Czego NIE robimy

- Nie implementujemy parsera komend, aliasów `/start` i `/who`, obliczania czasu pracy ani adaptera kontraktu F-01.
- Nie mapujemy użytkownika Google Chat na pracownika, nie zapisujemy tożsamości i nie logujemy danych osoby.
- Nie odczytujemy ani nie zapisujemy Supabase; nie tworzymy migracji, tabel ani polityk RLS.
- Nie pobieramy ogłoszeń, ankiet, obecności ani innych danych późniejszych slice'ów.
- Nie używamy panelowego Google SSO ani cookies Supabase do ochrony callbacka.
- Nie dodajemy sekretu współdzielonego jako zastępstwa dla weryfikacji tokena Google.
- Nie wdrażamy Preview URL ani osobnego Workera stagingowego; wybranym celem jest istniejący Worker produkcyjny.
- Nie logujemy Authorization, tokena, body, treści wiadomości, e-maila, display name, identyfikatora użytkownika ani
  surowego wyjątku.
- Nie implementujemy trwałej deduplikacji, kolejek, asynchronicznych odpowiedzi, metryk biznesowych ani dashboardu.

## Podejście do implementacji

Najpierw powstanie czysty, framework-neutral kontrakt request/response z wstrzykiwanym verifierem, zegarem, generatorem
request ID i loggerem. Dzięki temu pełna macierz metod, limitów, auth, błędów, zdarzeń oraz redakcji logów będzie
wykonywalna w Vitest bez prawdziwej sieci i bez specjalnego trybu omijania zabezpieczeń.

Druga faza podłączy kontrakt do Astro i Cloudflare: doda verifier `jose`, server-only audience, endpoint z eksportami
`POST` i `ALL` oraz jawne ominięcie panelowego Supabase dla dokładnej trasy callbacka. Zdalny JWKS będzie współdzielony
na poziomie modułu, a wszystkie odpowiedzi endpointu pozostaną `no-store`.

Trzecia faza rozszerzy CI o automatyczny deploy po wszystkich bramkach na `main`, zapisze wymagania operacyjne Google
Chat i Cloudflare oraz przeprowadzi pełny smoke produkcyjny. Konfiguracja zewnętrzna pozostaje ręcznym wymaganiem
wstępnym, ale sam deploy kodu jest automatyczny zgodnie z podjętą decyzją.

## Krytyczne szczegóły implementacji

Weryfikacja bearer tokena musi zakończyć się przed odczytaniem body. Ogranicza to przetwarzanie nieautoryzowanych danych
i sprawia, że błędny token zawsze daje `401`, niezależnie od zawartości payloadu. Limit 256 KiB musi być egzekwowany nie
tylko przez `Content-Length`, który może nie istnieć lub być fałszywy, ale również przez rzeczywistą liczbę bajtów
odczytanego body.

Globalna ochrona Cloudflare Access nie może wymagać interaktywnego logowania na ścieżce callbacka, ponieważ Google Chat
nie wykona takiego flow. Jeżeli Access chroni domenę Workera, `/api/bot/google-chat` otrzymuje wąski path-level bypass;
publiczny ingress tej trasy nadal jest fail-closed dzięki kryptograficznej weryfikacji Google OIDC. Pozostałe trasy nie
dziedziczą wyjątku.

## Faza 1: Kontrakt callbacka i testy

### Przegląd

Faza definiuje wszystkie zachowania callbacka jako czystą logikę, zanim pojawi się zależność od Astro, Google JWKS lub
produkcyjnej konfiguracji. Wynikiem jest wykonywalny kontrakt, który późniejsza trasa tylko adaptuje do runtime.

### Wymagane zmiany

#### 1. Kontrakt wejścia, wyjścia i zależności

**Plik**: `src/lib/bot/google-chat-callback.ts`

**Cel**: Zdefiniować jeden testowalny handler dla metody HTTP, autoryzacji, limitu body, parsowania zdarzenia i
bezpiecznych odpowiedzi.

**Kontrakt**: Handler przyjmuje `Request` oraz wstrzykiwane zależności: verifier bearer tokena, zegar monotoniczny,
generator request ID i sink logów. Maksymalny body wynosi `262144` bajtów. Dozwolona metoda to wyłącznie `POST`, a
obsługiwany content type to `application/json` z opcjonalnymi parametrami. Odpowiedzi mapują: inna metoda → `405` z
`Allow: POST`; zły content type → `415`; przekroczony body → `413`; błędny JSON lub brak obiektowego eventu/typu →
`400`; niepoprawny auth → `401`; niedostępny verifier → `503`; nieoczekiwany błąd → `500`.

Typ zdarzenia jest normalizowany z udokumentowanego envelope bez utrwalania całego body. Każde poprawne i
uwierzytelnione zdarzenie zwraca stałe `{ text: string }`, z wyjątkiem `REMOVED_FROM_SPACE`, które zwraca puste `204`.
Wszystkie odpowiedzi zawierają `Cache-Control: no-store`; odpowiedzi z body mają JSON UTF-8. Tekst jest komunikatem
technicznym F-03 i nie obiecuje wykonania komendy domenowej.

#### 2. Wyniki weryfikacji i bezpieczny model logu

**Plik**: `src/lib/bot/google-chat-contract.ts`

**Cel**: Oddzielić rozstrzygnięcia bezpieczeństwa i obserwowalności od implementacji Google oraz `console`.

**Kontrakt**: Verifier zwraca dyskryminowany wynik `valid | invalid | unavailable`; handler nie otrzymuje claimów ani
tożsamości użytkownika. Rekord logu ma zamknięty allowlist: `requestId`, `eventType` po poprawnej walidacji, `outcome`,
`status`, `durationMs`. Dla niezwalidowanego body `eventType` jest pomijany. Każde żądanie emituje jeden terminalny
rekord; żaden błąd zewnętrzny ani dane wejściowe nie są częścią kontraktu loggera.

#### 3. Testy macierzy callbacka

**Plik**: `tests/bot/google-chat-callback.test.ts`

**Cel**: Udowodnić pełne zachowanie HTTP, kolejność zabezpieczeń oraz redakcję bez sieci i bez sekretów.

**Kontrakt**: Testy obejmują wszystkie statusy, warianty nagłówka bearer, JSON z parametrem charset, brak i fałszywy
`Content-Length`, rzeczywisty limit UTF-8, błędne body, wyjątek zależności, każde reprezentatywne zdarzenie oraz
`REMOVED_FROM_SPACE`. Szpieg verifiera dowodzi, że nieautoryzowany request nie jest parsowany; test loggera porównuje
cały rekord do allowlisty i dowodzi braku body, tokena, osoby oraz surowego błędu. Sukces `{ text }` jest sprawdzany
istniejącym `isTextResponse` z kontraktu F-01.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Testy handlera pokrywają metody, auth, typ treści, limit 256 KiB, JSON, zdarzenia i mapowanie błędów.
- Poprawna odpowiedź przechodzi istniejący walidator `{ text: string }`, a `REMOVED_FROM_SPACE` zwraca `204`.
- Test loggera dowodzi pojedynczego zredagowanego wpisu i weryfikacji auth przed parsowaniem body.
- `npm test`, `npm run lint` i `npm run build` przechodzą po fazie.

#### Weryfikacja ręczna

- Kontrakt został porównany z zakresem F-03 i nie przejmuje komend ani danych S-04+.
- Komunikaty błędów i logi nie ujawniają tokena, payloadu, danych osoby ani surowych wyjątków.

**Uwaga implementacyjna**: Po automatycznej weryfikacji zatrzymaj się, aby człowiek potwierdził dwa kryteria ręczne
przed przejściem do Fazy 2.

---

## Faza 2: Integracja Astro i Google OIDC

### Przegląd

Faza podłącza czysty kontrakt do rzeczywistego runtime Cloudflare. Endpoint otrzymuje produkcyjną weryfikację Google,
nie zależy od Supabase i zachowuje ten sam kontrakt odpowiedzi w `workerd`.

### Wymagane zmiany

#### 1. Worker-compatible verifier Google

**Pliki**: `package.json`, `package-lock.json`, `src/lib/bot/google-chat-auth.ts`

**Cel**: Zweryfikować pochodzenie żądania kryptograficznie bez Node-only SDK i bez własnej implementacji JOSE.

**Kontrakt**: Projekt dodaje bieżącą stabilną wersję `jose`. Verifier używa współdzielonego na poziomie modułu remote
JWKS `https://www.googleapis.com/oauth2/v3/certs`, akceptuje wyłącznie RS256 i issuer
`https://accounts.google.com`, sprawdza `exp`, dokładny audience oraz `email === chat@system.gserviceaccount.com` i
`email_verified === true`. Błąd podpisu, claimów, czasu lub formatu daje `invalid`; brak audience albo przejściowa awaria
pobrania kluczy daje `unavailable`. Szczegóły wyjątku pozostają wewnątrz adaptera i nie trafiają do odpowiedzi ani logu.

#### 2. Server-only konfiguracja audience

**Pliki**: `astro.config.mjs`, `.env.example`, `README.md`

**Cel**: Uczynić dokładny produkcyjny URL callbacka jawną konfiguracją runtime bez udostępniania go klientowi.

**Kontrakt**: Schemat Astro dodaje opcjonalne na etapie builda, server-only `GOOGLE_CHAT_AUDIENCE`. W produkcji wartość
jest dokładnie równa `https://<production-host>/api/bot/google-chat`; brak lub rozbieżność kończy callback jako `503` lub
`401`, nigdy jako tryb niezabezpieczony. `.env.example` zawiera wyłącznie placeholder, a README opisuje lokalne wartości
i konieczność restartu serwera po zmianie env. Żaden prywatny klucz ani Google OAuth Client Secret nie jest potrzebny.

#### 3. Endpoint Astro i logger runtime

**Plik**: `src/pages/api/bot/google-chat.ts`

**Cel**: Wystawić kontrakt jako jeden endpoint Astro SSR i zapewnić jawne `405` dla pozostałych metod.

**Kontrakt**: Trasa eksportuje uppercase `POST: APIRoute` oraz `ALL: APIRoute`; oba delegują do czystego handlera, który
sam rozstrzyga metodę. Adapter przekazuje verifier `jose`, `crypto.randomUUID()`, czas runtime oraz logger oparty na
ustrukturyzowanym `console`. `2xx` i oczekiwane `4xx` są logowane informacyjnie, a `5xx` jako błąd bez obiektu wyjątku.
Trasa nie tworzy klienta Supabase, nie odczytuje cookies i nie ma dev-only bypassu auth.

#### 4. Pominięcie panelowej sesji w middleware

**Pliki**: `src/middleware.ts`, `src/lib/auth/route-access.ts`, `tests/contracts/access/route-access.test.ts`

**Cel**: Usunąć Supabase z krytycznej ścieżki callbacka bez osłabienia ochrony panelu.

**Kontrakt**: Dokładny segment `/api/bot/google-chat` jest klasyfikowany jako zewnętrzny callback, dla którego middleware
ustawia anonimowe locals i przechodzi bez `createClient()`, `auth.getUser()` i odczytu `panel_accounts`. Prefiksy podobne,
np. `/api/bot/google-chat-extra`, nie korzystają z wyjątku. Dotychczasowa klasyfikacja `/dashboard`, `/api/panel`, auth i
forbidden pozostaje bez zmian. Odpowiedzi callbacka są `no-store` niezależnie od ogólnego middleware.

#### 5. Runbook konfiguracji Google Chat i Cloudflare

**Plik**: `docs/google-chat-callback.md`

**Cel**: Zapisać powtarzalną konfigurację produkcyjną oraz granice odpowiedzialności operatora.

**Kontrakt**: Dokument podaje dokładną trasę, audience typu HTTP endpoint URL, ograniczoną widoczność aplikacji dla
testerów, wymagane API Google Chat oraz procedurę ustawienia server-only audience w Workerze. Jeśli domenę chroni
Cloudflare Access, runbook wymaga wyjątku tylko dla callbacka i zachowania ochrony pozostałych tras. Dokument opisuje
statusy odpowiedzi, redakcję logów, `wrangler tail`, retry Google, brak efektów ubocznych F-03 oraz zakaz produkcyjnych
danych w przykładach curl.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Testy verifiera odrzucają zły podpis, algorytm, issuer, audience, czas, e-mail i `email_verified` oraz rozróżniają 401/503.
- Testy routingu dowodzą, że tylko dokładny callback omija Supabase, a wszystkie guardy panelu zachowują kontrakt.
- Testy endpointu potwierdzają eksport `POST`/`ALL`, nagłówki `no-store` i bezpieczne mapowanie adapterów runtime.
- `npm test`, `npm run lint` i `npm run build` przechodzą w runtime docelowym Cloudflare.

#### Weryfikacja ręczna

- Lokalny `workerd` zwraca oczekiwane `401`, `405`, `413`, `415` i `503` bez niebezpiecznego bypassu auth.
- Dokumentacja nie umieszcza sekretów Google, Supabase ani Cloudflare w repozytorium i rozwiązuje konflikt z Access.

**Uwaga implementacyjna**: Po automatycznej weryfikacji zatrzymaj się, aby człowiek sprawdził lokalne odpowiedzi i
runbook przed włączeniem automatycznego wdrożenia produkcyjnego.

---

## Faza 3: Automatyczny deploy i produkcyjny smoke

### Przegląd

Faza zamyka walking skeleton rzeczywistym wdrożeniem. CI publikuje wyłącznie po zielonych bramkach na `main`, a ręczny
smoke test dowodzi połączenia Google Chat → Worker, bezpieczeństwa, logów, czasu odpowiedzi oraz gotowego rollbacku.

### Wymagane zmiany

#### 1. Job automatycznego wdrożenia produkcyjnego

**Plik**: `.github/workflows/ci.yml`

**Cel**: Automatycznie wdrażać zweryfikowany commit do istniejącego Workera `workbot` po merge/pushu do `main`.

**Kontrakt**: Osobny job `deploy` ma `needs: ci`, uruchamia się tylko dla `push` do `main` i nie działa dla pull requestów.
Używa minimalnych uprawnień GitHub oraz sekretów `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`; nie pobiera ani nie
drukuje wartości aplikacyjnych sekretów Workera. Job wykonuje czystą instalację, jawny produkcyjny build Astro oraz
`wrangler deploy` z istniejącym `wrangler.jsonc`. Przed wdrożeniem zapisuje bieżący identyfikator wersji/deploymentu w
GitHub job summary, a po sukcesie zapisuje identyfikator nowej wersji i adres. Niepowodzenie bramki lub deployu kończy
job błędem.

#### 2. Konfiguracja sekretów i automatycznego deployu

**Pliki**: `README.md`, `docs/google-chat-callback.md`

**Cel**: Opisać jednorazowe wymagania, bez których automatyczny push mógłby wdrożyć niedziałający callback.

**Kontrakt**: Przed merge operator konfiguruje ograniczony token Cloudflare w GitHub, account ID, runtime
`GOOGLE_CHAT_AUDIENCE` i dotychczasowe Supabase secrets bez ich rotacji. Dokument wskazuje, że job wdraża cały Worker, nie
tylko trasę bota, oraz że Google Chat musi mieć ten sam dokładny HTTPS endpoint. Zmiana URL wymaga skoordynowanej zmiany
audience i konfiguracji Chat przed kolejnym automatycznym deployem.

#### 3. Produkcyjny smoke i rollback

**Plik**: `docs/google-chat-callback.md`

**Cel**: Dostarczyć jednoznaczną checklistę zamknięcia F-03 i bezpiecznego cofnięcia wersji.

**Kontrakt**: Smoke obejmuje instalację/wywołanie aplikacji przez ograniczone konto testowe, co najmniej `MESSAGE` i
zdarzenie dodania do przestrzeni, widoczny tekst, czas end-to-end poniżej pięciu sekund oraz `REMOVED_FROM_SPACE` bez
próby odpowiedzi. Negatywne wywołania potwierdzają `401` bez tokena/z błędnym tokenem, `415` dla złego content type i
`413` dla przekroczonego body. `wrangler tail` potwierdza dokładnie allowlistę logu bez PII i sekretów. Operator zapisuje
poprzedni identyfikator z job summary i gotowe polecenie `wrangler rollback <VERSION_ID>`; rollback nie jest wykonywany,
jeśli smoke przechodzi.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Pull request uruchamia wszystkie bramki, ale nigdy job wdrożeniowy; push do `main` wdraża dopiero po sukcesie `ci`.
- Job wdrożeniowy używa wyłącznie nazw sekretów, nie ujawnia wartości i zapisuje poprzednią oraz nową wersję.
- Pełne `npm test`, `npm run lint` i `npm run build` przechodzą przed automatycznym `wrangler deploy`.

#### Weryfikacja ręczna

- Prawdziwe zdarzenia Google Chat otrzymują zgodną odpowiedź, a `REMOVED_FROM_SPACE` kończy się bez wiadomości.
- Odpowiedź na wiadomość jest widoczna w czasie poniżej pięciu sekund.
- Brak/zły token, zły content type i przekroczony body zwracają odpowiednio 401, 415 i 413 bez szczegółów zabezpieczeń.
- Produkcyjne logi zawierają wyłącznie request ID, typ zdarzenia, wynik, status i czas.
- Cloudflare Access pozostaje aktywny dla pozostałych powierzchni, a callback ma wyłącznie wymagany wyjątek ścieżki.
- Poprzednia wersja i polecenie rollbacku są zapisane przed zamknięciem F-03.

**Uwaga implementacyjna**: Faza kończy się dopiero po ręcznym smoke teście produkcyjnym. Sam zielony deploy CI nie
spełnia kryterium F-03.

## Strategia testowania

### Testy jednostkowe

- Czysty handler: kolejność auth → body, metoda, content type, rzeczywisty rozmiar UTF-8, JSON, typ zdarzenia, statusy,
  nagłówki, tekst i wyjątek `REMOVED_FROM_SPACE`.
- Verifier: format bearer, algorytm, podpis, issuer, audience, czas i service-account claims oraz rozróżnienie
  `invalid`/`unavailable` bez prawdziwego Google JWKS.
- Logger: pełne porównanie rekordów do zamkniętej allowlisty oraz brak tokena, body, PII i surowego wyjątku.
- Routing: dokładne dopasowanie callbacka i brak regresji istniejących stron/API panelu.

### Testy integracyjne

- Trasa Astro deleguje do handlera dla `POST` i `ALL`, zachowuje status, JSON i `Cache-Control: no-store`.
- Produkcyjny build Cloudflare potwierdza kompatybilność `jose`, Web Crypto, remote JWKS i modułowego cache.
- Workflow dowodzi zależności `deploy` od całego joba jakości oraz wykluczenia pull requestów.

### Kroki testowania ręcznego

1. Przed merge sprawdź audience, URL Google Chat, widoczność dla testerów, Cloudflare Access i obecność nazw sekretów.
2. Po automatycznym deployu otwórz `wrangler tail`, dodaj bota do testowej przestrzeni i wyślij wiadomość.
3. Potwierdź tekst, brak odpowiedzi po usunięciu bota oraz czas end-to-end poniżej pięciu sekund.
4. Wyślij kontrolowane żądania bez/z błędnym tokenem, złym content type i body ponad 256 KiB.
5. Porównaj każdy log z allowlistą i zapisz identyfikator poprzedniej wersji oraz polecenie rollbacku.

## Uwagi dotyczące wydajności

Callback nie wykonuje zapytań Supabase ani logiki domenowej. Resolver Google JWKS jest tworzony raz na moduł i korzysta
z cache kluczy, więc zwykłe żądanie nie powinno pobierać JWKS ponownie. Body ma twardy limit 256 KiB, log jest pojedynczy,
a odpowiedź synchroniczna i statyczna. Projektowy budżet wynosi mniej niż pięć sekund end-to-end; logowany `durationMs`
mierzy część Workerową, a ręczny smoke mierzy doświadczenie w Google Chat.

## Uwagi dotyczące migracji

Zmiana nie modyfikuje bazy danych ani trwałych danych. Nowe elementy operacyjne to zależność `jose`, server-only
`GOOGLE_CHAT_AUDIENCE`, dwa sekrety GitHub dla Cloudflare oraz konfiguracja callbacka w Google Chat. Rollback kodu wraca
do poprzedniej wersji Workera; nie cofa sekretów ani konfiguracji Google, dlatego poprzednia wersja musi nadal tolerować
istniejące bindingi. Wyłączenie callbacka awaryjnie odbywa się przez rollback Workera lub zmianę konfiguracji Google
Chat, nie przez osłabienie weryfikacji tokena.

## Otwarte ryzyka i założenia

- Bezpośredni deploy na produkcję jest zaakceptowaną decyzją. Ryzyko ograniczają pełne bramki CI, testowa widoczność
  aplikacji Google Chat, brak efektów ubocznych i zapisany rollback.
- Automatyczny deploy zakłada, że ograniczony token Cloudflare i runtime audience są skonfigurowane przed pierwszym
  merge; brak audience jest fail-closed i daje `503`.
- Dokładny URL audience wiąże konfigurację z hostem i ścieżką. Każda zmiana adresu wymaga skoordynowanej aktualizacji.
- Dostępność pierwszego requestu po rotacji kluczy zależy od Google JWKS. Awaria transportu jest jawna jako `503`, a
  Google może ponowić żądanie.
- Globalny Cloudflare Access może blokować serwer Google. Zaakceptowany model to wąski bypass tylko callbacka i Google
  OIDC jako właściwa ochrona ingressu.
- Statyczna odpowiedź dla szerokiego zbioru zdarzeń jest wyłącznie diagnostyczna. `REMOVED_FROM_SPACE` pozostaje `204`,
  a późniejsze slice'y zastąpią zachowanie właściwymi handlerami.

Powyższe punkty są przyjętymi ograniczeniami planu, a nie nierozstrzygniętymi pytaniami.

## Referencje

- Tożsamość zmiany: `context/changes/bot-preview-path/change.md`
- Roadmapa F-03: `context/foundation/roadmap.md:97-109`
- PRD — format, tożsamość i budżet: `context/foundation/prd.md:58-61`, `context/foundation/prd.md:114-126`,
  `context/foundation/prd.md:139-147`
- Obecny middleware i routing: `src/middleware.ts:22-47`, `src/lib/auth/route-access.ts:1-58`
- Kontrakt odpowiedzi bota: `tests/contracts/bot/response-schema.ts:38-43`, `tests/contracts/bot/README.md:21-42`
- Cloudflare i operacje: `wrangler.jsonc:3-16`, `context/foundation/infrastructure.md:159-188`
- Obecny CI: `.github/workflows/ci.yml:1-37`
- Google Chat — weryfikacja żądań: `https://developers.google.com/workspace/chat/verify-requests-from-chat`
- Google Chat — zdarzenia, retry i odpowiedzi: `https://developers.google.com/workspace/chat/receive-respond-interactions`
- Google Cloud — tokeny: `https://cloud.google.com/docs/authentication/token-types`
- `jose` i Cloudflare Workers: `https://github.com/panva/jose`
- Cloudflare Workers — routing i rollback: `https://developers.cloudflare.com/workers/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Kontrakt callbacka i testy

#### Automated

- [x] 1.1 Testy handlera pokrywają metody, auth, typ treści, limit 256 KiB, JSON, zdarzenia i mapowanie błędów — 10e9ff0
- [x] 1.2 Poprawna odpowiedź przechodzi walidator tekstowy, a REMOVED_FROM_SPACE zwraca 204 — 10e9ff0
- [x] 1.3 Logger emituje jeden zredagowany wpis, a auth poprzedza parsowanie body — 10e9ff0
- [x] 1.4 Testy, lint i produkcyjny build przechodzą po fazie — 10e9ff0

#### Manual

- [x] 1.5 Kontrakt pozostaje w zakresie F-03 bez komend i danych S-04+ — 10e9ff0
- [x] 1.6 Odpowiedzi błędów i logi nie ujawniają tokenów, payloadu, PII ani wyjątków — 10e9ff0

### Phase 2: Integracja Astro i Google OIDC

#### Automated

- [x] 2.1 Verifier sprawdza pełny kontrakt Google i rozróżnia niepoprawny auth od niedostępności — 10e9ff0
- [x] 2.2 Tylko dokładny callback omija Supabase bez regresji guardów panelu — 10e9ff0
- [x] 2.3 Endpoint POST i ALL zachowuje no-store oraz bezpieczne mapowanie runtime — 10e9ff0
- [x] 2.4 Testy, lint i produkcyjny build przechodzą w runtime Cloudflare — 10e9ff0

#### Manual

- [x] 2.5 Lokalny workerd zwraca kontrolowane 401, 405, 413, 415 i 503 bez bypassu auth — 10e9ff0
- [x] 2.6 Dokumentacja nie ujawnia sekretów i rozwiązuje konflikt callbacka z Cloudflare Access — 10e9ff0

### Phase 3: Automatyczny deploy i produkcyjny smoke

#### Automated

- [x] 3.1 Pull request nie wdraża, a push do main wdraża wyłącznie po sukcesie CI
- [x] 3.2 Job nie ujawnia sekretów i zapisuje poprzednią oraz nową wersję Workera
- [x] 3.3 Testy, lint i produkcyjny build przechodzą przed automatycznym deployem

#### Manual

- [ ] 3.4 Prawdziwe zdarzenia Google Chat otrzymują zgodną odpowiedź z wyjątkiem REMOVED_FROM_SPACE
- [ ] 3.5 Odpowiedź na wiadomość jest widoczna w czasie poniżej pięciu sekund
- [ ] 3.6 Negatywne próby zwracają 401, 415 i 413 bez szczegółów zabezpieczeń
- [ ] 3.7 Produkcyjne logi zawierają wyłącznie zatwierdzoną allowlistę metadanych
- [ ] 3.8 Cloudflare Access zachowuje ochronę pozostałych powierzchni
- [ ] 3.9 Poprzednia wersja i polecenie rollbacku są zapisane
