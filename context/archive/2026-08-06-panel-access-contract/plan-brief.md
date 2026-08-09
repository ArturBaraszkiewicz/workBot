# Minimalny kontrakt dostępu do panelu — krótki plan

> Pełny plan: `context/changes/panel-access-contract/plan.md`

## Co i dlaczego

F-02 ustanawia firmowe Google SSO i granicę ról przed funkcjami panelu. Panel wymaga aktywnego grantu;
HR/Admin ma pełne capabilities, a PM tylko odczyt statystyk przypisanych zespołów.

## Punkt wyjścia

Aplikacja ma starterowe email/hasło, publiczny signup i jedną trasę chronioną zasadą „jest sesja”. Nie istnieją role,
granty panelowe, migracje, RLS, callback OAuth ani testy autoryzacji.

## Pożądany stan końcowy

Logowanie używa firmowego Google i PKCE. Aktualny `panel_accounts` buduje principal przy każdym żądaniu.
Brak lub dezaktywacja grantu blokuje panel, a RLS chroni dane niezależnie od UI.

## Podjęte kluczowe decyzje

| Decyzja           | Wybór                       | Dlaczego                                                        | Źródło          |
| ----------------- | --------------------------- | --------------------------------------------------------------- | --------------- |
| Zakres F-02       | Działający fundament        | Późniejsze slice'y potrzebują realnej granicy bezpieczeństwa    | Plan            |
| Role              | `hr_admin` i `pm`           | PRD nie definiuje różnicy HR kontra Admin                       | PRD / Plan      |
| Źródło prawdy     | `panel_accounts`            | Trwały grant jest niezależny od danych edytowalnych przez usera | Plan            |
| Dopuszczenie      | Google auth + aktywny grant | SSO potwierdza tożsamość, administrator nadaje panel            | PRD / Plan      |
| Pierwszy admin    | Ręczny bootstrap Supabase   | Worker nie otrzymuje `service_role`                             | Plan            |
| PM→zespół         | Kontrakt `assignedTeamIds`  | Trwałe przypisania należą do S-02                               | Roadmapa / Plan |
| Odmowa            | Redirect, 401, 403 lub 503  | Nie mieszamy braku sesji, roli i awarii bazy                    | Plan            |
| Domena            | Google Workspace Internal   | Aplikacja nie powiela zewnętrznej reguły domeny                 | Plan            |
| Aktualność grantu | Odczyt na każde żądanie     | Najprostsza natychmiastowa dezaktywacja dla małej skali         | Plan            |
| Testy             | Vitest + pgTAP/RLS          | Dowód obejmuje aplikację i faktyczną granicę bazy               | Plan            |

## Zakres

**W zakresie:**

- Google OAuth/PKCE, cookies Supabase SSR oraz usunięcie email/password i publicznego signup.
- `panel_accounts`, role, aktywność, bezpieczne helpery i RLS.
- Principal, capability matrix, segmentowe guardy tras oraz 401/403/503.
- Testy Vitest i pgTAP, lokalny Supabase, CI oraz runbook bootstrapu.

**Poza zakresem:**

- Tabele zespołów, pracowników, statystyk i przypisań PM→zespół.
- UI/API grantów, rola employee, awaryjne hasło, Google E2E i `service_role` w Workerze.
- Ochrona ostatniego administratora; odzyskanie dostępu opisuje runbook.

## Architektura / podejście

Google OAuth → callback PKCE → sesja → aktualny `panel_accounts` przez publishable key i RLS → typowany stan
`Astro.locals` → guardy stron/API; każda przyszła tabela nadal wymusza własne RLS.

## Fazy w skrócie

| Faza            | Co dostarcza                                     | Kluczowe ryzyko                                   |
| --------------- | ------------------------------------------------ | ------------------------------------------------- |
| 1. Kontrakt     | Principal, capabilities, route outcomes i Vitest | Nazwy capabilities staną się stabilnym API        |
| 2. Granty i RLS | Migrację, typy bazy i pgTAP                      | Błędna polityka mogłaby umożliwić eskalację       |
| 3. Google SSO   | PKCE, middleware, 403 i usunięcie signup         | Błędy auth nie mogą być cache'owane ani ujawniane |
| 4. Operacje     | Provider config, CI, bootstrap i smoke test      | Zależy od dostępu do Google Workspace/Supabase    |

**Wymagania wstępne:** Docker/Supabase dla pgTAP; Google Workspace i hostowany Supabase dla ręcznego smoke testu.

**Szacowany wysiłek:** Cztery fazy implementacyjne z ręczną bramką po każdej; około 3–5 sesji pracy.

## Otwarte ryzyka i założenia

- Google Workspace Internal egzekwuje domenę, a PM ma pusty rzeczywisty zakres do czasu S-02.
- Jedno zapytanie o grant na chronione żądanie jest akceptowalne dla docelowej skali.
- Ręczny bootstrap może zablokować panel; procedura Supabase pozostaje ścieżką odzyskania.
- Brak dostępu do zewnętrznego tenanta nie blokuje kodu, lecz blokuje zaznaczenie ręcznego smoke testu.

## Kryteria sukcesu — podsumowanie

- Konto Google bez aktywnego grantu nie widzi panelu, a zmiana roli/aktywności działa przy następnym żądaniu.
- HR/Admin ma pełny dostęp kontraktowy, PM tylko odczyt własnego zakresu, a unknown/anonymous są deny-by-default.
- `npm test`, `npm run test:db`, `npm run lint` i `npm run build` przechodzą i są egzekwowane przez CI.
- Publiczne signup oraz email/password nie istnieją, a prawdziwy provider przechodzi udokumentowany smoke test PKCE.
