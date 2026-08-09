# Plan implementacji minimalnego kontraktu dostępu do panelu

## Przegląd

Zmiana `panel-access-contract` realizuje roadmapowe F-02. Jej celem jest zastąpienie starterowego logowania
email/hasło działającym fundamentem firmowego Google SSO oraz jednoznaczną, wykonywalną granicą dostępu dla ról
`hr_admin` i `pm`.

Uwierzytelnienie Google potwierdza tożsamość, ale samo nie nadaje dostępu do panelu. Źródłem prawdy jest aktywny rekord
`panel_accounts`, odczytywany przy każdym chronionym żądaniu. Brak rekordu, nieaktywne konto lub nieznana rola oznacza
odmowę. RLS pozostaje ostateczną granicą danych niezależnie od zabezpieczeń middleware i UI.

## Analiza bieżącego stanu

Repozytorium ma request-scoped klienta Supabase SSR i weryfikuje użytkownika przez `auth.getUser()`, ale rozpoznaje
wyłącznie stan zalogowany/niezalogowany (`src/lib/supabase.ts:1-23`, `src/middleware.ts:4-24`). Tylko `/dashboard` jest
chronione, a każdy poprawny użytkownik Supabase może je otworzyć (`src/pages/dashboard.astro:4-16`).

Logowanie korzysta z emaila i hasła, a publiczna rejestracja jest dostępna w stronie, API oraz konfiguracji lokalnego
Supabase (`src/pages/api/auth/signin.ts:4-19`, `src/pages/api/auth/signup.ts:4-19`,
`supabase/config.toml:168-175`, `supabase/config.toml:202-209`). Nie istnieją callback PKCE, role panelowe, migracje
domenowe, polityki RLS ani testy autoryzacji. Vitest i krok `npm test` są już dostępne i działają w CI
(`package.json:5-13`, `.github/workflows/ci.yml:18-25`).

F-02 jest fundamentem dla kolejnych funkcji panelu, ale nie może przejąć ich modeli domenowych. Tabele zespołów,
przypisania PM-ów oraz statystyki należą odpowiednio do S-01, S-02, S-10 i S-11
(`context/foundation/roadmap.md:83-95`, `context/foundation/roadmap.md:113-135`,
`context/foundation/roadmap.md:221-242`).

## Pożądany stan końcowy

Panel używa Google OAuth w przepływie PKCE. Publiczny signup i logowanie hasłem nie istnieją. Pierwsze uwierzytelnienie
Google może utworzyć tożsamość w `auth.users`, lecz wejście do panelu wymaga aktywnego `panel_accounts`. Google Workspace
ogranicza dostawcę do firmowej organizacji, natomiast aplikacja nie zgaduje ani nie powiela reguły domeny.

Każde żądanie ma rozróżniony kontekst: anonimowy, uwierzytelniony bez dostępu, uprawniony albo chwilowo nieweryfikowalny
z powodu błędu magazynu. Strony przekierowują anonimowego użytkownika do logowania, renderują 403 dla użytkownika bez
grantu i 503 przy niedostępności źródła uprawnień. API zwraca odpowiadające im JSON 401/403/503. Uprawniony
`hr_admin` ma pełne capabilities panelowe, a `pm` wyłącznie odczyt statystyk zespołów przekazanych w
`assignedTeamIds`; trwałe źródło tych przypisań powstanie w S-02.

### Kluczowe odkrycia

- `@supabase/ssr` jest już używany request-scoped i zapisuje odświeżone cookies w odpowiedzi
  (`src/lib/supabase.ts:5-23`), więc można zachować istniejącą granicę klienta.
- PRD definiuje jedno wspólne uprawnienie HR/Admin, PM-a przypisanego do jednego lub wielu zespołów oraz pracownika bez
  panelu (`context/foundation/prd.md:103-112`, `context/foundation/prd.md:139-147`).
- Klucz publishable/anon jest celowo używany zamiast `service_role`, aby zapytania podlegały RLS
  (`docs/deployment-cloudflare-supabase.md:34-41`).
- Supabase SSR używa PKCE; callback musi wymienić jednorazowy kod przez `exchangeCodeForSession` i zapisać sesję w
  cookies.
- Testy bazy można uruchamiać lokalnie przez `supabase test db`/pgTAP; obecny CI nie uruchamia jeszcze lokalnego
  Supabase.

## Czego NIE robimy

- Nie tworzymy tabel zespołów, pracowników, przypisań PM→zespół, statystyk ani danych domenowych późniejszych slice'ów.
- Nie budujemy UI ani API do zarządzania grantami `panel_accounts`; F-02 zapewnia model, RLS i ręczny bootstrap.
- Nie dodajemy roli panelowej `employee`; brak aktywnego grantu jest stanem deny-by-default.
- Nie przechowujemy `assignedTeamIds` w JWT i nie implementujemy custom access-token hooka ani cache uprawnień.
- Nie dodajemy `service_role` ani innego uprzywilejowanego sekretu do Cloudflare Workera.
- Nie implementujemy awaryjnego logowania hasłem, magic linku ani publicznej rejestracji.
- Nie automatyzujemy prawdziwego logowania Google w CI; zewnętrzny tenant pozostaje ręczną bramką smoke testu.
- Nie rozwiązujemy automatycznie blokady ostatniego administratora; odzyskanie dostępu pozostaje procedurą Supabase
  opisaną w runbooku.

## Podejście do implementacji

Najpierw powstanie niezależny kontrakt TypeScript opisujący principal, capabilities oraz granice stron i API. Następnie
kontrakt otrzyma trwałe źródło w migracji `panel_accounts` i testach pgTAP. Trzecia faza zastąpi starterowy auth Google
OAuth/PKCE i podłączy aktualny grant do middleware, UI i guardów. Ostatnia faza zamknie konfigurację dostawcy,
automatyczne bramki bazy, bootstrap i dokumentację wdrożenia.

## Krytyczne szczegóły implementacji

Wyłączenie `enable_signup` globalnie zablokowałoby tworzenie pierwszej tożsamości `auth.users` przez Google OAuth.
Dlatego lokalny i hostowany Supabase mają pozwalać na tworzenie użytkownika przez wewnętrznego providera Google, ale
email signup zostaje wyłączony, a aplikacyjne strony i endpointy rejestracji są usunięte. Dostęp do panelu nadal zawsze
wymaga aktywnego `panel_accounts`.

Błąd odczytu `panel_accounts` nie może wyglądać jak zwykłe 403, ponieważ ukrywałby awarię bezpieczeństwa lub bazy.
Resolver ma zwracać jawny stan `unavailable`, a chroniona powierzchnia ma wtedy kończyć się bez ujawnienia danych jako 503. Weryfikacja grantu odbywa się przy każdym żądaniu; zmiana roli lub `active` obowiązuje natychmiast.

## Faza 1: Wykonywalny kontrakt autoryzacji

### Przegląd

Faza ustala provider-neutral model dostępu, zanim pojawią się SQL i OAuth. Kontrakt ma być możliwy do użycia przez
middleware, przyszłe endpointy domenowe oraz polityki danych bez duplikowania reguł.

### Wymagane zmiany

#### 1. Typy principala i macierz capabilities

**Plik**: `src/lib/auth/panel-access.ts`

**Cel**: Zdefiniować kanoniczne role i jeden wykonywalny punkt decyzyjny dla dostępu panelowego.

**Kontrakt**: Moduł eksportuje `PanelRole` z wartościami `hr_admin | pm`, dyskryminowany `PanelPrincipal`, zamknięty
zbiór capabilities oraz czyste funkcje autoryzacji. `hr_admin` może wykonywać wszystkie zdefiniowane operacje panelowe.
`pm` może wyłącznie czytać statystyki, gdy identyfikator celu znajduje się w `assignedTeamIds`; pusta lista oznacza
dostęp do zera zespołów. Nieznana rola, nieznana capability lub brak principala zawsze zwracają odmowę.

#### 2. Klasyfikacja tras i wyników odmowy

**Plik**: `src/lib/auth/route-access.ts`

**Cel**: Oddzielić testowalne reguły stron/API od frameworkowego middleware.

**Kontrakt**: Klasyfikacja używa dopasowania pełnego segmentu (`path === prefix` albo `path.startsWith(prefix + "/")`),
nie surowego `startsWith`. Wynik rozróżnia publiczną trasę, stronę wymagającą panelu, API wymagające panelu oraz trasę
403 dostępną tylko dla uwierzytelnionych. Decyzje odpowiedzi mapują anonymous→redirect/401,
authenticated-without-grant→403 oraz access-unavailable→503.

#### 3. Dokumentacja i testy kontraktu

**Plik**: `tests/contracts/access/README.md`

**Cel**: Zapisać źródła, granice i odpowiedzialność późniejszych slice'ów.

**Kontrakt**: Dokument wskazuje PRD i roadmapę jako źródła, wyjaśnia różnicę między Google authn a grantem panelowym,
opisuje brak roli employee i seam `assignedTeamIds`, a także wymaga RLS dla każdej przyszłej tabeli domenowej.

**Plik**: `tests/contracts/access/panel-access.test.ts`

**Cel**: Zamrozić pełną macierz dostępu bez zależności od Astro lub Supabase.

**Kontrakt**: Syntetyczne przypadki obejmują anonymous, authenticated-unprovisioned, inactive, nieznaną rolę,
`hr_admin`, PM bez zespołów, PM z wieloma zespołami, obcy zespół, każdą mutację PM-a i nieznaną capability.

**Plik**: `tests/contracts/access/route-access.test.ts`

**Cel**: Udowodnić rozróżnienie stron/API oraz bezpieczne dopasowanie prefiksów.

**Kontrakt**: Testy obejmują dokładny prefiks, segment potomny, podobną nazwę niebędącą potomkiem, 401/403/503,
redirect dla strony i brak redirectu HTML dla API.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Macierz ról, capabilities i zakresów zespołów przechodzi: `npm test`.
- Typy kontraktu i testów są poprawne: `npx tsc --noEmit`.
- Nowe moduły i testy przechodzą lint: `npm run lint`.
- Produkcyjny build pozostaje zielony: `npm run build`.

#### Weryfikacja ręczna

- Macierz została porównana z FR-001, FR-006, FR-007, FR-010 i sekcją Access Control Changes PRD.
- Potwierdzono, że kontrakt nie tworzy trwałych zespołów ani nie nadaje PM-owi dostępu przy pustym zakresie.

**Uwaga implementacyjna**: Po fazie zatrzymaj się na ręczne potwierdzenie macierzy. Nazwy capabilities staną się
kontraktem używanym przez późniejsze plany i nie powinny być zmieniane przypadkowo.

---

## Faza 2: Trwałe granty i Row Level Security

### Przegląd

Faza dodaje pierwszą domenową migrację Supabase i dowodzi, że granty są deny-by-default, aktualne oraz niemożliwe do
samodzielnego podniesienia przez zwykłego użytkownika lub PM-a.

### Wymagane zmiany

#### 1. Schemat `panel_accounts` i bezpieczne helpery

**Plik**: `supabase/migrations/<timestamp>_panel_access_contract.sql`

**Cel**: Ustanowić trwałe źródło prawdy powiązane z `auth.users`.

**Kontrakt**: Migracja tworzy enum `panel_role` (`hr_admin`, `pm`) oraz tabelę `panel_accounts` z unikalnym
`user_id`, `role`, `active`, `created_at` i `updated_at`. Brak rekordu lub `active = false` oznacza odmowę. Aktualizacja
znacznika czasu jest deterministyczna, a usuwanie grantów przez API nie jest dozwolone — dostęp odbiera się przez
dezaktywację.

Migracja tworzy helpery w nieeksponowanym schemacie do sprawdzania aktualnego aktywnego grantu i roli. Funkcje
`SECURITY DEFINER` mają pusty `search_path`, w pełni kwalifikowane nazwy, minimalne `EXECUTE` i odebrane uprawnienia
PUBLIC/anon. Nie istnieje ścieżka zapisu roli przez `user_metadata` ani przez zwykłego użytkownika.

#### 2. Polityki RLS grantów

**Plik**: `supabase/migrations/<timestamp>_panel_access_contract.sql`

**Cel**: Egzekwować model dostępu również przy bezpośrednim użyciu PostgREST.

**Kontrakt**: RLS jest włączone i wymuszone dla `panel_accounts`. Uwierzytelniony użytkownik może odczytać wyłącznie
własny rekord potrzebny do zbudowania principala. Aktywny `hr_admin` może odczytywać, dodawać i aktualizować granty na
potrzeby przyszłego interfejsu administracyjnego. PM, nieaktywny użytkownik i brak grantu nie mogą mutować danych.
Anonimowy użytkownik nie ma dostępu. DELETE nie jest grantowane żadnej roli aplikacyjnej.

#### 3. Typowana granica klienta Supabase

**Plik**: `src/lib/database.types.ts`

**Cel**: Udostępnić wygenerowane typy nowego schematu kodowi aplikacji.

**Kontrakt**: Typy odpowiadają migracji i są generowane z lokalnego Supabase, bez ręcznego rozluźniania do `any`.

**Plik**: `src/lib/supabase.ts`

**Cel**: Zachować request-scoped klienta i objąć zapytania pełnym typowaniem.

**Kontrakt**: `createServerClient` jest parametryzowany typem `Database`. Sekrety pozostają server-only, a klucz
publishable/anon nadal wykonuje operacje w kontekście JWT i RLS.

#### 4. Testy migracji i RLS

**Plik**: `supabase/tests/database/panel_access_contract.test.sql`

**Cel**: Udowodnić strukturę, ograniczenia oraz pozytywne i negatywne polityki na prawdziwym lokalnym Postgresie.

**Kontrakt**: Test pgTAP działa w transakcji na syntetycznych `auth.users`. Sprawdza enum, FK, domyślną aktywność,
wymuszone RLS, własny odczyt, izolację innych użytkowników, brak dostępu anonymous, HR CRUD bez DELETE, zakaz zapisu
PM-a, konto nieaktywne oraz brak możliwości samodzielnej eskalacji roli.

**Plik**: `supabase/seed.sql`

**Cel**: Naprawić istniejące wskazanie konfiguracji do brakującego pliku i utrzymać reset środowiska powtarzalnym.

**Kontrakt**: Plik jest bezpiecznym, pustym seedem lub zawiera wyłącznie jawnie syntetyczne dane deweloperskie; nie
tworzy schematu i nie bootstrapuje administratora produkcyjnego.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Migracja i seed odtwarzają czystą bazę: `npx supabase db reset`.
- Testy schematu i RLS przechodzą: `npm run test:db`.
- Wygenerowane typy odpowiadają lokalnemu schematowi bez błędów TypeScript: `npx tsc --noEmit`.
- Testy aplikacyjne, lint i build pozostają zielone: `npm test`, `npm run lint`, `npm run build`.

#### Weryfikacja ręczna

- W lokalnym Studio potwierdzono, że zwykły użytkownik i PM nie mogą nadać sobie ani zmienić roli.
- Przejrzano migrację pod kątem uprawnień helperów, wymuszenia RLS i braku `service_role` w aplikacji.

**Uwaga implementacyjna**: Migracja jest addytywna. Rollback Workera nie cofa schematu Supabase; przed wysłaniem do
hostowanego projektu należy użyć `supabase db push --dry-run` i zachować tabelę podczas rollbacku aplikacji.

---

## Faza 3: Google SSO i egzekwowanie dostępu

### Przegląd

Faza zastępuje starterowe email/hasło przepływem Google OAuth/PKCE, podłącza aktualny grant do `Astro.locals` i
egzekwuje uzgodnione 401/403/503 dla stron oraz API.

### Wymagane zmiany

#### 1. Inicjacja Google OAuth i callback PKCE

**Plik**: `src/pages/api/auth/signin.ts`

**Cel**: Rozpoczynać wyłącznie firmowy przepływ Google z request-scoped klienta.

**Kontrakt**: Endpoint zachowuje uppercase `POST: APIRoute`, wywołuje `signInWithOAuth({ provider: "google" })` z
callbackiem `/api/auth/callback` i jawnie przekierowuje do zwróconego URL. Brak konfiguracji lub błąd providera mapuje
się na stały, bezpieczny kod UI; nie ujawnia surowego komunikatu i nie oferuje fallbacku hasłem. F-02 zawsze wraca do
`/dashboard`, więc nie przyjmuje dowolnego `next`.

**Plik**: `src/pages/api/auth/callback.ts`

**Cel**: Bezpiecznie wymienić jednorazowy kod PKCE na sesję i rozstrzygnąć pierwszy dostęp.

**Kontrakt**: `GET: APIRoute` obsługuje brak/zużyty kod i błąd providera, tworzy klienta dla bieżącego requestu,
wywołuje `exchangeCodeForSession`, a następnie ładuje aktualny grant. Aktywny grant prowadzi do `/dashboard`, brak grantu
do `/forbidden`, a błąd magazynu do bezpiecznego 503. Callback nie odbija `error_description`, zewnętrznych URL ani
provider tokenów.

**Plik**: `src/pages/api/auth/signout.ts`

**Cel**: Zakończyć sesję również ze strony odmowy.

**Kontrakt**: POST obsługuje błąd wylogowania bez ujawnienia szczegółów i zawsze kończy na stronie logowania.

#### 2. Resolver principala i stan requestu

**Plik**: `src/lib/auth/panel-principal.ts`

**Cel**: Mapować zweryfikowanego użytkownika i bieżący rekord RLS na jeden jawny stan dostępu.

**Kontrakt**: Resolver zwraca dyskryminowaną unię `anonymous | denied | granted | unavailable`. `granted` zawiera
`PanelPrincipal`; dla PM-a rzeczywiste `assignedTeamIds` jest na tym etapie pustą listą, lecz testy kontraktu mogą
wstrzykiwać syntetyczne wartości. Brak/nieaktywna/nieznana rola jest `denied`; błąd zapytania jest `unavailable`.

**Plik**: `src/env.d.ts`

**Cel**: Udostępnić typowany stan każdej stronie i trasie API.

**Kontrakt**: `App.Locals` zachowuje `user`, dodaje pełny stan dostępu i nie pozwala traktować samego `User` jako
uprawnienia panelowego.

#### 3. Middleware i guardy zasobów

**Plik**: `src/middleware.ts`

**Cel**: Egzekwować wspólne wejście do powierzchni panelowej bez pomijania przyszłych tras.

**Kontrakt**: Middleware nadal używa `auth.getUser()`, a dla uwierzytelnionego użytkownika odczytuje aktualny grant przy
każdym żądaniu. Korzysta z segmentowego matchera z fazy 1. Strony panelu: anonymous→signin, denied→wewnętrzna odpowiedź
403, unavailable→503. API panelu zwraca JSON 401/403/503. Middleware nie zastępuje capability guardów handlerów ani RLS.

#### 4. Strony i nawigacja zależne od principala

**Plik**: `src/pages/auth/signin.astro`

**Cel**: Pokazać pojedynczą, dostępną klawiaturowo akcję „Zaloguj przez Google”.

**Kontrakt**: Strona składa POST do `/api/auth/signin`, mapuje tylko znane kody błędów i nie zawiera pól email/hasło
ani linku signup. Użytkownik z grantem trafia do dashboardu, a uwierzytelniony bez grantu do 403.

**Plik**: `src/pages/forbidden.astro`

**Cel**: Wyjaśnić uwierzytelnionemu użytkownikowi brak provisioningu bez pętli logowania.

**Kontrakt**: Odpowiedź ma status 403, nie ujawnia danych roli ani innych kont, zawiera bezpieczne wylogowanie i krótką
instrukcję kontaktu z administratorem. Bezpośrednia wizyta anonimowa prowadzi do signin.

**Plik**: `src/pages/dashboard.astro`

**Cel**: Używać `PanelPrincipal` zamiast dowolnego `User`.

**Kontrakt**: Dashboard renderuje wyłącznie stan `granted`, pokazuje bezpieczną identyfikację/rolę i nie implementuje
jeszcze modułów domenowych.

**Plik**: `src/components/Topbar.astro`

**Cel**: Nie reklamować panelu użytkownikowi tylko dlatego, że ma sesję Google.

**Kontrakt**: Link dashboardu jest widoczny wyłącznie dla `granted`; `denied` otrzymuje wylogowanie/komunikat odmowy, a
anonymous wyłącznie signin. Komponent nie wykonuje własnych zapytań ani decyzji autoryzacyjnych.

**Plik**: `src/components/Welcome.astro`

**Cel**: Usunąć starterowy przekaz o publicznym signupie i kierować do firmowego SSO.

**Kontrakt**: CTA i treść opisują wewnętrzny workBot; nie istnieje link ani obietnica tworzenia konta.

#### 5. Usunięcie publicznej rejestracji i formularzy hasła

**Pliki**:

- `src/pages/api/auth/signup.ts`
- `src/pages/auth/signup.astro`
- `src/pages/auth/confirm-email.astro`
- `src/components/auth/SignUpForm.tsx`
- `src/components/auth/SignInForm.tsx`
- `src/components/auth/FormField.tsx`
- `src/components/auth/PasswordToggle.tsx`
- `src/components/auth/SubmitButton.tsx`
- `src/components/auth/ServerError.tsx`

**Cel**: Usunąć wszystkie aplikacyjne ścieżki email/password i osierocone komponenty startera.

**Kontrakt**: GET/POST signup nie istnieją, confirm-email nie jest osiągalne, a repo nie zawiera klientowego formularza
hasła. Bezpośrednia próba starej ścieżki kończy się 404; wyłączenie email signup w Supabase pozostaje drugą warstwą.

#### 6. Testy integracji aplikacyjnej z adapterami

**Plik**: `tests/auth/oauth-and-guards.test.ts`

**Cel**: Sprawdzić przepływ bez prawdziwego Google i bez sieci.

**Kontrakt**: Testy używają atrap klienta/resolvera i obejmują URL providera, brak URL, callback bez kodu, nieudany
exchange, grant, brak grantu, nieaktywny grant, błąd bazy, logout oraz rozróżnienie stron/API. Nie testują implementacji
Google ani nie zapisują prawdziwych cookies.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Testy OAuth, principala i guardów przechodzą bez sieci: `npm test`.
- Stare ścieżki signup i komponenty hasła nie są importowane ani linkowane: sprawdzenie repozytorium przez `rg`.
- Typy locals, resolvera i endpointów są poprawne: `npx tsc --noEmit`.
- Lint i produkcyjny build przechodzą: `npm run lint`, `npm run build`.

#### Weryfikacja ręczna

- Przy braku skonfigurowanego providera signin pokazuje kontrolowany błąd bez fallbacku hasłem.
- Uwierzytelniony użytkownik bez grantu widzi prawdziwe 403 i może się wylogować; anonymous jest kierowany do signin.
- Bezpośrednie wywołania panelowego API zwracają JSON 401/403/503, nie HTML redirect.

**Uwaga implementacyjna**: Odpowiedzi auth i wszystkie trasy, które mogą zapisać odświeżone cookies, nie mogą być
cache'owane publicznie przez Cloudflare. Zachowaj request-scoped klienta i nagłówki `Set-Cookie`/cache przekazane przez
`@supabase/ssr`.

---

## Faza 4: Konfiguracja, CI i bootstrap operacyjny

### Przegląd

Faza sprawia, że lokalny i hostowany przepływ można odtworzyć bez sekretów w repo, a testy RLS stają się obowiązkową
bramką. Dokumentacja rozdziela callback Google→Supabase od callbacku Supabase→Astro i opisuje pierwszy grant.

### Wymagane zmiany

#### 1. Lokalna konfiguracja Supabase Auth

**Plik**: `supabase/config.toml`

**Cel**: Odzwierciedlić firmowy Google OAuth i brak email signup w środowisku lokalnym.

**Kontrakt**: Site URL i redirect allowlist używają rzeczywistego portu Astro. Email signup jest wyłączony. Globalne
tworzenie tożsamości pozostaje dostępne wyłącznie po to, aby pierwszy login przez wewnętrznego providera Google mógł
utworzyć `auth.users`; nie jest traktowane jako grant panelowy. Sekcja Google provider korzysta z lokalnych zmiennych
CLI i nie zawiera Client Secret w repo. Niepotrzebny szablon Apple nie jest aktywowany.

**Plik**: `.env.example`

**Cel**: Udokumentować nazwy wymaganych wartości bez ujawnienia sekretów.

**Kontrakt**: Przykład rozróżnia `SUPABASE_URL`/publishable `SUPABASE_KEY` używane przez Astro od Client ID/Secret
providera używanych przez lokalny Supabase. Dane Google nie trafiają do `astro:env` ani do klienta React.

#### 2. Skrypty i bramka pgTAP w CI

**Plik**: `package.json`

**Cel**: Udostępnić kanoniczne polecenie testów bazy.

**Kontrakt**: `test:db` uruchamia `supabase test db` wobec działającego lokalnego stacka. Istniejące `test`, lint i build
pozostają niezależne i nie łączą się w nieprzejrzysty skrypt.

**Plik**: `.github/workflows/ci.yml`

**Cel**: Uniemożliwić scalenie migracji lub RLS, które nie przechodzą na czystym Supabase.

**Kontrakt**: CI instaluje zależności, uruchamia lokalny Supabase/migracje, wykonuje `npm test` i `npm run test:db`, a
następnie lint i build. Stack jest zatrzymywany w kroku `always()`. Testy używają wyłącznie syntetycznych danych i nie
łączą się z hostowanym projektem ani Google.

#### 3. Runbook konfiguracji, bootstrapu i wdrożenia

**Plik**: `README.md`

**Cel**: Zastąpić instrukcje email/password aktualnym lokalnym onboardingiem.

**Kontrakt**: README opisuje Google SSO, brak publicznego signup, uruchomienie/reset Supabase, `test:db`, stan 403 bez
grantu i bezpieczny syntetyczny bootstrap. Nie twierdzi już, że projekt korzysta wyłącznie z `auth.users` bez migracji.

**Plik**: `docs/deployment-cloudflare-supabase.md`

**Cel**: Uzupełnić konfigurację produkcyjną o wszystkie zewnętrzne kroki F-02.

**Kontrakt**: Runbook opisuje:

- wewnętrzny Google Workspace OAuth app jako egzekwowanie firmowej organizacji,
- Google redirect do `<supabase>/auth/v1/callback` i allowlistę aplikacyjnego `/api/auth/callback`,
- wyłączenie email signup przy zachowaniu tworzenia tożsamości Google,
- konfigurację providera w hostowanym Supabase bez commitowania sekretu,
- `supabase db push --dry-run` przed migracją,
- pierwszy login administratora kończący się 403, ręczne nadanie `hr_admin` przez SQL Editor/Dashboard i natychmiastowy
  dostęp po odświeżeniu żądania,
- brak `service_role` w Workerze, procedurę ręcznego odzyskania dostępu i ryzyko blokady ostatniego administratora,
- smoke test HR, PM bez zespołów, użytkownika bez grantu, logout oraz próbę starego signup.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Czysta instalacja i wszystkie testy aplikacyjne przechodzą: `npm ci`, `npm test`.
- Czysty lokalny schemat i pgTAP przechodzą: `npx supabase db reset`, `npm run test:db`.
- Pełne bramki repozytorium przechodzą: `npm run lint`, `npm run build`.
- Workflow CI zawiera kolejność install → Supabase/migrations → test → test:db → lint → build i cleanup stacka.

#### Weryfikacja ręczna

- Google Workspace Internal i hostowany provider kierują przez PKCE callback do aplikacji bez email/password fallbacku.
- Pierwszy administrator przechodzi udokumentowane 403 → ręczny grant → dostęp bez dodania sekretu uprzywilejowanego.
- Użytkownik domenowy bez grantu i nieaktywny użytkownik nie widzą danych; PM z pustym zakresem nie widzi statystyk.
- Zmiana `active` lub roli w `panel_accounts` obowiązuje przy następnym chronionym żądaniu.

**Uwaga implementacyjna**: Faza nie jest ręcznie zamknięta bez smoke testu prawdziwego providera, ale brak dostępu do
tenanta Google/Supabase nie blokuje wykonania kodu, migracji ani automatycznych testów. Niezrealizowany smoke test musi
pozostać niezaznaczony w `Progress`, nie może być raportowany jako zaliczony.

## Strategia testowania

### Testy jednostkowe

- Macierz `hr_admin`/`pm`, brak grantu, nieaktywne konto i unknown-deny.
- PM dla pustego, własnego, obcego i wielozespołowego zakresu.
- Klasyfikacja tras i mapowanie anonymous/denied/unavailable na redirect albo 401/403/503.
- Mapowanie rekordu Supabase na principal bez zaufania do emaila, user metadata lub UI.

### Testy integracyjne

- Endpoint inicjacji OAuth i callback PKCE z atrapą request-scoped klienta.
- Middleware z kontrolowanymi wynikami `getUser()` oraz resolvera grantu.
- Migracja i RLS przez pgTAP na syntetycznych `auth.users`.
- Odtworzenie czystego schematu przez `supabase db reset` przed testami bazy.

### Kroki testowania ręcznego

1. Zalogować nowe konto firmowe przez Google i potwierdzić 403 bez grantu.
2. Nadać temu `auth.users.id` rolę `hr_admin` w Supabase i odświeżyć dashboard.
3. Zmienić rolę na `pm`, a następnie `active = false`, weryfikując natychmiastową zmianę dostępu.
4. Potwierdzić, że PM bez przypisanych zespołów nie ma dostępu do żadnych statystyk.
5. Sprawdzić JSON 401/403/503 na bezpośrednim wywołaniu chronionego API.
6. Sprawdzić 404 dla dawnych tras signup oraz brak logowania hasłem w UI i API.
7. Wylogować użytkownika ze strony 403 i potwierdzić usunięcie sesji.

## Uwagi dotyczące wydajności

Jedno zapytanie o własny aktywny grant na uwierzytelnione żądanie jest świadomym wyborem. Dla docelowej skali
kilkudziesięciu do około stu użytkowników mieści się w pięciosekundowym SLA i daje natychmiastową dezaktywację. Nie
wprowadzamy cache ani claims, dopóki pomiary nie wykażą realnego wąskiego gardła. Zapytanie używa klucza głównego
`user_id` i zwraca pojedynczy rekord.

## Uwagi dotyczące migracji

Migracja jest pierwszym schematem domenowym i nie przenosi danych prototypu. `panel_accounts` można wdrożyć przed kodem,
ponieważ dodaje nową, nieużywaną tabelę. Kod wymagający grantu powinien zostać wdrożony dopiero po migracji i bootstrapie
co najmniej jednego administratora. Rollback kodu pozostawia tabelę bezpiecznie na miejscu; destrukcyjne cofanie
migracji nie jest częścią procedury rollbacku.

## Otwarte ryzyka i założenia

- Dostęp do administracji Google Workspace i hostowanego Supabase jest zewnętrznym wymaganiem smoke testu, ale nie
  blokuje implementacji lokalnej.
- Konfiguracja Google jako Internal jest jedynym egzekwowaniem domeny; aplikacja nie sprawdza `hd` ani suffixu emaila.
- Ręczny bootstrap i brak ochrony ostatniego `hr_admin` mogą czasowo zablokować panel; runbook Supabase jest ścieżką
  odzyskania.
- PM ma w F-02 prawidłową rolę, lecz pusty rzeczywisty zakres zespołów do czasu S-02.
- CI z lokalnym Supabase wydłuży wykonanie i wymaga dostępnego Dockera na GitHub-hosted runnerze.

Wszystkie powyższe punkty są zaakceptowanymi ograniczeniami, a nie pytaniami wymagającymi decyzji przed implementacją.

## Referencje

- Tożsamość zmiany: `context/changes/panel-access-contract/change.md`
- Roadmapa F-02: `context/foundation/roadmap.md:83-95`
- Role i dostęp: `context/foundation/prd.md:103-112`, `context/foundation/prd.md:123-147`
- Decyzja Google SSO: `context/foundation/shape-notes.md:29-34`, `context/foundation/shape-notes.md:188-196`
- Request-scoped klient i middleware: `src/lib/supabase.ts:1-23`, `src/middleware.ts:4-24`
- Obecne auth UI/API: `src/pages/auth/signin.astro:1-21`, `src/pages/api/auth/signin.ts:1-20`,
  `src/pages/api/auth/signup.ts:1-20`
- Lokalny Supabase Auth: `supabase/config.toml:150-175`, `supabase/config.toml:202-209`
- Wdrożenie i granica RLS: `docs/deployment-cloudflare-supabase.md:29-41`,
  `docs/deployment-cloudflare-supabase.md:185-210`
- Supabase Google OAuth: `https://supabase.com/docs/guides/auth/social-login/auth-google`
- Supabase RBAC i custom claims: `https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac`
- Supabase testy RLS: `https://supabase.com/docs/guides/local-development/testing/overview`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Wykonywalny kontrakt autoryzacji

#### Automated

- [x] 1.1 Macierz ról, capabilities i zakresów zespołów przechodzi testy
- [x] 1.2 Typy kontraktu i testów przechodzą sprawdzanie TypeScript
- [x] 1.3 Nowe moduły przechodzą lint i produkcyjny build

#### Manual

- [x] 1.4 Macierz została porównana z wymaganiami dostępu PRD
- [x] 1.5 Kontrakt nie przejmuje trwałych zespołów ani przypisań S-02

### Phase 2: Trwałe granty i Row Level Security

#### Automated

- [x] 2.1 Migracja i seed odtwarzają czystą lokalną bazę
- [x] 2.2 Testy pgTAP schematu i RLS przechodzą
- [x] 2.3 Typowany klient, testy aplikacyjne, lint i build pozostają zielone

#### Manual

- [x] 2.4 Zwykły użytkownik i PM nie mogą eskalować własnej roli
- [x] 2.5 Uprawnienia helperów i brak service_role zostały przejrzane

### Phase 3: Google SSO i egzekwowanie dostępu

#### Automated

- [x] 3.1 Testy OAuth, principala i guardów przechodzą bez sieci
- [x] 3.2 Stare ścieżki signup i komponenty hasła nie są importowane ani linkowane
- [x] 3.3 Typy, lint i produkcyjny build przechodzą

#### Manual

- [x] 3.4 Brak providera daje kontrolowany błąd bez fallbacku hasłem
- [x] 3.5 Strony i API rozróżniają redirect, 401, 403 i 503
- [x] 3.6 Użytkownik bez grantu może bezpiecznie wylogować się ze strony 403

### Phase 4: Konfiguracja, CI i bootstrap operacyjny

#### Automated

- [x] 4.1 Czysta instalacja i testy aplikacyjne przechodzą
- [x] 4.2 Reset schematu i testy pgTAP przechodzą — lokalny reset zastąpiony uzgodnioną weryfikacją migracji i 27 testami pgTAP na podpiętym stagingu
- [x] 4.3 Lint i produkcyjny build przechodzą
- [x] 4.4 CI uruchamia migracje, testy aplikacyjne, pgTAP, lint, build i cleanup

#### Manual

- [x] 4.5 Prawdziwy Google Workspace provider przechodzi smoke test PKCE — be25d81
- [x] 4.6 Pierwszy administrator przechodzi udokumentowany bootstrap bez service_role — be25d81
- [x] 4.7 Brak grantu, nieaktywne konto i PM bez zespołów pozostają zablokowane — be25d81
- [x] 4.8 Zmiana roli lub aktywności obowiązuje przy następnym chronionym żądaniu — be25d81
