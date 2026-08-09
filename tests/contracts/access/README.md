# Kontrakt dostępu do panelu F-02

Ten katalog jest wykonywalnym, niezależnym od providera kontraktem roadmapowego elementu
**F-02 `panel-access-contract`**. Jego źródłami są `context/foundation/prd.md` (FR-001, FR-006, FR-007, FR-010 oraz
sekcja Access Control Changes) i `context/foundation/roadmap.md` (F-02). Kontrakt nie importuje Astro, Supabase ani
zewnętrznego providera tożsamości.

## Tożsamość a dostęp

Firmowe Google SSO jedynie uwierzytelnia użytkownika. Sesja Google lub rekord w `auth.users` nie są grantem do panelu.
Dostęp wymaga aktywnego, rozpoznanego konta panelowego, które w kolejnej fazie będzie przechowywane w
`panel_accounts`. Brak grantu, grant nieaktywny oraz nieznana rola zawsze oznaczają odmowę.

Panel ma dwie role:

- `hr_admin` ma wszystkie capabilities zdefiniowane przez kontrakt;
- `pm` może wyłącznie odczytać statystyki zespołu obecnego w `assignedTeamIds`.

Nie istnieje panelowa rola `employee`. Pracownik korzysta z bota przez firmowy chat i domyślnie nie ma dostępu do
panelu. Nieznana capability także jest odrzucana, aby rozszerzenie powierzchni panelu wymagało jawnej decyzji.

## Granica przypisań zespołów

`assignedTeamIds` jest celowym seamem kontraktu. Syntetyczne testy dowodzą pustego, jedno- i wielozespołowego zakresu,
ale F-02 nie tworzy tabel zespołów ani trwałych relacji PM→zespół. Ich model i źródło danych należą do S-01 oraz S-02.
Do czasu ich wdrożenia rzeczywisty principal PM-a otrzyma pustą listę, czyli dostęp do statystyk zera zespołów.

## Egzekwowanie w kolejnych slice'ach

Reguły principala i tras są pierwszą, wspólną granicą dla middleware, stron i endpointów. Nie zastępują jednak ochrony
danych. Każda przyszła tabela domenowa musi mieć włączone Row Level Security i własne polityki zgodne z tym kontraktem,
tak aby pominięcie UI, middleware lub handlera nie umożliwiało szerszego odczytu albo zapisu.

Klasyfikacja tras rozróżnia publiczne strony, chronione strony panelu, chronione API i stronę odmowy. Dopasowanie
prefiksu odbywa się wyłącznie po pełnym segmencie. Dzięki temu na przykład `/dashboarding` nie dziedziczy ochrony
`/dashboard`, a API zwraca 401/403/503 zamiast przekierowania HTML.
