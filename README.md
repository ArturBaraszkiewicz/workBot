# workBot

Wewnętrzna aplikacja firmy łącząca panel administracyjny z API bota czasu pracy. Panel działa jako Astro 6 SSR na
Cloudflare Workers, używa React 19, Tailwind CSS 4 oraz hostowanego Supabase dla Google SSO, PostgreSQL i Row Level
Security.

## Wymagania

- Node.js 22.14.0 (`.nvmrc`) i npm,
- projekt Supabase oraz aplikacja OAuth typu **Internal** w Google Workspace,
- konto panelowe w `panel_accounts`; samo zalogowanie Google nie nadaje dostępu,
- opcjonalnie Docker tylko do lokalnego `supabase start` i `npm run test:db`.

## Instalacja i konfiguracja

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item .env.example .env.production
Copy-Item .env.example .dev.vars
```

Po skopiowaniu usuń z `.env`, `.env.production` i `.dev.vars` wpisy `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`. W tych plikach
ustaw wyłącznie wartości używane przez aplikację:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=sb_publishable_xxxxxxxxxxxxx
GOOGLE_CHAT_AUDIENCE=http://localhost:4321/api/bot/google-chat
```

`SUPABASE_KEY` musi być kluczem publishable/anon. Nie dodawaj `service_role` ani secret key do Workera — omijają RLS.
Zmienne providera Google są przeznaczone dla Supabase CLI, nie dla Astro ani Cloudflare:

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<client-secret>
```

Przechowuj je w ignorowanym pliku `supabase/.env` lub w zmiennych bieżącej sesji. Nigdy nie commituj sekretu Google.

## Uruchomienie

```powershell
npm run dev
```

`astro dev` odczytuje aplikacyjne wartości z ignorowanego pliku `.env`. Po zmianie `SUPABASE_URL`, `SUPABASE_KEY` lub
`GOOGLE_CHAT_AUDIENCE` całkowicie zrestartuj serwer deweloperski; `.env.production` nie jest automatycznie ładowany w
trybie development. Audience Google Chat musi być dokładnym URL-em callbacka, łącznie ze schematem, hostem, portem i
ścieżką. Brak wartości powoduje kontrolowane `503` — nie włącza trybu bez uwierzytelnienia.

W produkcyjnym Workerze ustaw `GOOGLE_CHAT_AUDIENCE` jako server-only secret na dokładny adres
`https://<production-host>/api/bot/google-chat`. Callback nie wymaga Google OAuth Client Secret ani prywatnego klucza;
weryfikuje podpisany przez Google token OIDC przez publiczny JWKS. Szczegółowa konfiguracja znajduje się w
[docs/google-chat-callback.md](docs/google-chat-callback.md).

## Automatyczny deploy na Cloudflare

Push do `main` wdraża produkcyjnego Workera dopiero po przejściu całego joba `ci`. Pull requesty uruchamiają weryfikację,
ale nigdy nie uruchamiają joba `deploy`. Przed pierwszym automatycznym wdrożeniem:

1. Utwórz ograniczony do właściwego konta token Cloudflare z uprawnieniem **Workers Scripts: Edit**. Dodaj w GitHub
   Actions dwa sekrety repozytorium: `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`.
2. Upewnij się, że Worker ma dotychczasowe runtime secrets `SUPABASE_URL` i `SUPABASE_KEY`; nie rotuj ich na potrzeby
   tego workflow.
3. Ustaw runtime secret `GOOGLE_CHAT_AUDIENCE` na dokładny adres
   `https://<production-host>/api/bot/google-chat`.
4. Przed kolejnym pushem ustaw w Google Chat ten sam dokładny endpoint i **Authentication Audience**. Zmianę hosta,
   schematu, ścieżki albo końcowego ukośnika skoordynuj po obu stronach.

Job wykonuje czystą instalację, jawny build produkcyjny i `wrangler deploy`. Wdraża cały Worker `workbot`, w tym panel i
pozostałe API — nie tylko callback bota. Nie pobiera wartości runtime secrets do GitHub Actions. Job summary zapisuje
poprzednią wersję i polecenie rollbacku, a po sukcesie nową wersję oraz adres wdrożenia. Procedura produkcyjnego smoke
testu znajduje się w [docs/google-chat-callback.md](docs/google-chat-callback.md#produkcyjny-smoke-i-rollback).

Domyślny lokalny callback aplikacji to `http://127.0.0.1:4321/api/auth/callback`. Google przekierowuje najpierw do
Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`), a Supabase kończy PKCE w callbacku aplikacji.

Nie ma publicznego signup ani logowania email/hasło. Pierwszy login Google może utworzyć rekord `auth.users`, ale bez
aktywnego `panel_accounts` użytkownik zobaczy 403 i będzie mógł się wylogować.

## Baza danych i migracje

Połącz CLI z projektem stagingowym i zawsze obejrzyj dry-run przed migracją:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push
```

Lokalny reset wymaga Dockera:

```powershell
npx supabase start
npx supabase db reset
npm run test:db
```

Jeżeli pracujesz wyłącznie na połączonym stagingu, test pgTAP można wykonać bez Dockera przez Management API:

```powershell
npm run test:db:linked
```

Test używa wyłącznie syntetycznych użytkowników, działa w transakcji i kończy się `ROLLBACK`.

## Pierwszy administrator

1. Zaloguj się firmowym kontem Google; pierwsza próba poprawnie kończy się 403.
2. W Supabase odczytaj `auth.users.id` tej osoby.
3. W SQL Editor wykonaj, zastępując UUID:

```sql
insert into public.panel_accounts (user_id, role, active)
values ('00000000-0000-0000-0000-000000000000', 'hr_admin', true);
```

4. Odśwież `/dashboard`. Grant jest odczytywany przy każdym chronionym żądaniu, więc nie trzeba ponownie wydawać JWT.

Nie usuwaj grantów przez API. Dostęp odbiera się przez `active = false`. Utrata ostatniego aktywnego `hr_admin` wymaga
ręcznej naprawy w Supabase SQL Editor/Dashboard.

## Skrypty

- `npm run dev` — lokalny serwer Astro/Cloudflare,
- `npm test` — testy Vitest,
- `npm run test:db` — lokalne pgTAP (wymaga uruchomionego Supabase/Dockera),
- `npm run test:db:linked` — transakcyjne pgTAP na połączonym projekcie stagingowym bez Dockera,
- `npm run lint` — type-aware ESLint,
- `npm run build` — produkcyjny build Cloudflare,
- `npm run format` — Prettier.

## Trasy uwierzytelniania

| Trasa                  | Zachowanie                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `/auth/signin`         | Jedyna akcja logowania: firmowe Google SSO                 |
| `/api/auth/callback`   | Wymiana jednorazowego kodu PKCE na sesję                   |
| `/forbidden`           | 403 dla uwierzytelnionego użytkownika bez aktywnego grantu |
| `/dashboard`           | Panel dostępny wyłącznie dla aktywnego `hr_admin` lub `pm` |
| `/api/panel/**`        | JSON 401/403/503 zależnie od stanu dostępu                 |
| `/api/bot/google-chat` | Callback Google Chat chroniony Google OIDC; bez Supabase   |

Każda przyszła tabela domenowa musi mieć własne polityki RLS. Middleware i ukrywanie elementów UI nie zastępują ochrony
danych w PostgreSQL.

## Weryfikacja przed PR

```powershell
npm test
npm run lint
npm run build
```

CI dodatkowo uruchamia czysty lokalny Supabase, migracje i `npm run test:db`. Szczegółowy runbook produkcyjny znajduje
się w [docs/deployment-cloudflare-supabase.md](docs/deployment-cloudflare-supabase.md).
