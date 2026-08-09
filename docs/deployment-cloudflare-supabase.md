# Wdrożenie workBot: Cloudflare Workers, Supabase i Google Workspace

## Architektura i granica sekretów

```text
Przeglądarka → Google Workspace → Supabase Auth → Astro SSR na Cloudflare → Supabase Postgres + RLS
```

Cloudflare Worker otrzymuje tylko:

- `SUPABASE_URL`,
- `SUPABASE_KEY` jako publishable/anon key.

Client ID i Client Secret Google konfiguruje się wyłącznie w Supabase. `service_role` ani Supabase secret key nie mogą
trafić do Workera — omijają Row Level Security.

## 1. Google Workspace OAuth

W Google Cloud Console utwórz aplikację OAuth dla organizacji i ustaw **User type: Internal**. To Google Workspace, a
nie kod aplikacji, egzekwuje firmową domenę. workBot nie sprawdza suffixu e-maila ani parametru `hd`.

Dodaj dokładny Authorized redirect URI Supabase:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

To pierwszy z dwóch callbacków:

1. Google → Supabase: `/auth/v1/callback`,
2. Supabase → Astro: `/api/auth/callback`.

Zapisz Client ID i Client Secret w menedżerze sekretów. Nie commituj ich do repozytorium.

## 2. Supabase Auth

W **Authentication → Providers → Google**:

1. włącz provider Google,
2. wprowadź Client ID i Client Secret,
3. pozostaw email provider wyłączony dla nowych rejestracji,
4. nie wyłączaj globalnego tworzenia użytkowników — pierwszy login Google musi móc utworzyć `auth.users`.

W **Authentication → URL Configuration** ustaw:

- **Site URL:** dokładny adres Workera, np. `https://workbot.<subdomain>.workers.dev`,
- **Redirect URLs:** `https://workbot.<subdomain>.workers.dev/api/auth/callback`,
- opcjonalnie dla developmentu: `http://127.0.0.1:4321/api/auth/callback` i
  `http://localhost:4321/api/auth/callback`.

Nie używaj szerokich wildcardów na produkcji. Po przejściu na własną domenę dodaj jej dokładny callback przed zmianą
Site URL.

## 3. Migracja `panel_accounts`

Połącz CLI z właściwym projektem i przed każdym zapisem przejrzyj dry-run:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

Migracja tworzy enum `panel_role`, tabelę `panel_accounts`, helpery w schemacie `private` oraz wymuszone RLS. Jest
addytywna: rollback Workera nie cofa tabeli. Nie używaj `db reset --linked` na stagingu ani produkcji.

Po migracji wygeneruj i porównaj typy:

```powershell
npx supabase gen types typescript --linked --schema public
```

## 4. Testy RLS

CI uruchamia lokalny Supabase i standardowe:

```powershell
npm run test:db
```

Na świadomie wybranym projekcie stagingowym można uruchomić ten sam, transakcyjny plik bez lokalnego Dockera:

```powershell
npm run test:db:linked
```

Test tworzy wyłącznie syntetyczne `auth.users`, obejmuje anon, użytkownika bez grantu, nieaktywne konto, PM-a i
HR/Admina, a na końcu wykonuje `ROLLBACK`. Nie uruchamiaj go przeciwko produkcji bez osobnej decyzji operacyjnej.

## 5. Pierwszy administrator

Bootstrap nie używa `service_role` w aplikacji:

1. Zaloguj pierwszego administratora przez Google.
2. Oczekuj 403 — istnieje tożsamość, ale jeszcze nie grant.
3. W Supabase **Authentication → Users** skopiuj UUID użytkownika.
4. W SQL Editor wykonaj:

```sql
insert into public.panel_accounts (user_id, role, active)
values ('<auth-users-uuid>', 'hr_admin', true);
```

5. Odśwież `/dashboard`; dostęp powinien pojawić się przy następnym żądaniu.

Kolejnego PM-a nadaje się analogicznie z rolą `pm`. Do czasu S-02 PM ma pusty rzeczywisty `assignedTeamIds`, więc nie
widzi statystyk żadnego zespołu.

### Odzyskanie dostępu

System celowo nie blokuje dezaktywacji ostatniego administratora. Jeżeli nie ma aktywnego `hr_admin`, użyj Supabase SQL
Editor/Dashboard, aby ustawić istniejący grant:

```sql
update public.panel_accounts
set role = 'hr_admin', active = true
where user_id = '<auth-users-uuid>';
```

Nie dodawaj awaryjnego hasła ani `service_role` do Workera.

## 6. Cloudflare Worker

Zaloguj Wrangler i sprawdź konto:

```powershell
npx wrangler login
npx wrangler whoami
```

Ustaw wyłącznie aplikacyjne wartości w ignorowanym `.env.production`:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=sb_publishable_xxxxxxxxxxxxx
```

Wdróż:

```powershell
npm ci
npm test
npm run lint
npm run build
npx wrangler deploy --secrets-file .env.production
```

Sprawdź nazwy sekretów przez `npx wrangler secret list`. Client Secret Google nie powinien pojawić się na tej liście.

Endpointy auth, odpowiedzi chronione i odpowiedzi zapisujące cookies muszą zachować `Cache-Control: no-store` oraz
`Set-Cookie` przekazywane przez request-scoped `@supabase/ssr`.

## 7. Smoke test po wdrożeniu

Wykonaj kolejno:

1. Nowe firmowe konto Google → callback PKCE → 403 bez grantu.
2. Ręczny grant `hr_admin` → odświeżenie → dashboard.
3. Zmiana roli na `pm` → następne żądanie pokazuje rolę PM; zakres zespołów pozostaje pusty.
4. `active = false` → następne chronione żądanie kończy się 403.
5. Użytkownik domenowy bez `panel_accounts` nie widzi panelu.
6. Anonymous `/dashboard` przekierowuje do signin.
7. Anonymous `/api/panel/...` zwraca JSON 401; denied zwraca JSON 403; awaria grantu zwraca JSON 503.
8. Wylogowanie ze strony 403 kończy na signin.
9. `/auth/signup`, `/api/auth/signup` i `/auth/confirm-email` zwracają 404.
10. UI nie zawiera emaila, hasła, magic linku ani publicznej rejestracji.

Podczas smoke testu obserwuj logi bez zapisywania tokenów, provider tokenów ani surowych błędów OAuth:

```powershell
npx wrangler tail --format pretty
```

## 8. Rollback

- Kod Workera można cofnąć do poprzedniej wersji Cloudflare.
- Tabeli `panel_accounts` i enumu nie usuwaj podczas rollbacku aplikacji.
- Przed ponownym wdrożeniem zawsze wykonaj `supabase db push --dry-run`.
- Jeżeli problem dotyczy konfiguracji providera, wyłącz Google w Supabase i przywróć konfigurację dopiero po korekcie;
  nie włączaj email/password jako awaryjnego fallbacku.

## Oficjalne źródła

- [Supabase: Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: testowanie bazy i RLS](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase CLI: db push](https://supabase.com/docs/reference/cli/supabase-migration-fetch#supabase-db-push)
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
