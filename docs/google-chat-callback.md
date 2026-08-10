# Callback Google Chat

Ten runbook opisuje diagnostyczny callback F-03. Endpoint potwierdza transport, Google OIDC, format odpowiedzi i logi;
nie wykonuje jeszcze komend, nie rozpoznaje pracowników i nie korzysta z Supabase.

## Kontrakt endpointu

- URL: `https://<production-host>/api/bot/google-chat`
- metoda: `POST`
- content type: `application/json` z opcjonalnymi parametrami
- maksymalny body: 256 KiB rzeczywistych bajtów UTF-8
- auth: Google-signed OIDC ID token w `Authorization: Bearer <token>`
- audience: dokładny URL endpointu, łącznie ze schematem, hostem i ścieżką

Poprawne zdarzenie otrzymuje statyczne `{ "text": "..." }`. `REMOVED_FROM_SPACE` kończy się pustym `204`, ponieważ
Google Chat nie przyjmuje wtedy odpowiedzi typu Message. Callback jest bezstanowy i nie ma efektów ubocznych, więc
ponowienia dostarczenia przez Google są bezpieczne w F-03.

| Status | Znaczenie                                                 |
| ------ | --------------------------------------------------------- |
| `200`  | Token i zdarzenie są poprawne; zwrócono statyczny tekst.  |
| `204`  | Poprawne `REMOVED_FROM_SPACE`; brak wiadomości zwrotnej.  |
| `400`  | JSON lub typ zdarzenia jest niepoprawny.                  |
| `401`  | Brak tokena albo niepoprawny podpis, algorytm lub claims. |
| `405`  | Metoda inna niż POST; odpowiedź zawiera `Allow: POST`.    |
| `413`  | Zadeklarowany lub rzeczywisty body przekracza 256 KiB.    |
| `415`  | Content type nie jest `application/json`.                 |
| `500`  | Nieoczekiwany błąd runtime.                               |
| `503`  | Brak audience albo chwilowa niedostępność Google JWKS.    |

Każda odpowiedź ma `Cache-Control: no-store`.

## Konfiguracja Google Chat

1. Włącz Google Chat API w projekcie Google Cloud przeznaczonym dla aplikacji.
2. W konfiguracji Google Chat ustaw endpoint HTTP na dokładne
   `https://<production-host>/api/bot/google-chat`.
3. Jako **Authentication Audience** wybierz **HTTP endpoint URL** i podaj ten sam dokładny URL.
4. Ogranicz widoczność aplikacji do wskazanych kont lub grup testerów przed wdrożeniem produkcyjnym.
5. Zapisz konfigurację i sprawdź zdarzenia `MESSAGE`, `ADDED_TO_SPACE` oraz `REMOVED_FROM_SPACE`.

Nie używaj audience typu Project Number dla tego wdrożenia. Nie jest potrzebny Google OAuth Client Secret, prywatny
klucz ani współdzielony sekret callbacka. Token podpisuje Google, a Worker sprawdza RS256 przez publiczny JWKS, issuer,
czas ważności, dokładny audience, `email_verified` i konto `chat@system.gserviceaccount.com`.

## Konfiguracja środowiska

Lokalny `astro dev` odczytuje audience z ignorowanego `.env`:

```dotenv
GOOGLE_CHAT_AUDIENCE=http://localhost:4321/api/bot/google-chat
```

Po zmianie wartości całkowicie zrestartuj serwer. `npm run preview` korzysta z runtime `workerd`; konfigurację podaj w
ignorowanym `.dev.vars` albo zgodnie z lokalnym profilem Cloudflare.

Na produkcji ustaw dokładny HTTPS URL jako szyfrowany sekret Workera:

```powershell
npx wrangler secret put GOOGLE_CHAT_AUDIENCE
```

Wartość w Google Chat i Workerze musi być identyczna. Zmiana domeny, schematu, końcowego ukośnika lub ścieżki wymaga
koordynowanej aktualizacji obu stron; rozbieżność daje `401`. Brak wartości daje `503` i nigdy nie wyłącza auth.

## Cloudflare Access

Google Chat nie wykonuje interaktywnego logowania Access. Jeżeli Access chroni host Workera:

1. Utwórz osobną, bardziej szczegółową aplikację self-hosted dokładnie dla ścieżki
   `<production-host>/api/bot/google-chat`.
2. Dodaj do niej politykę `Bypass` z `Include: Everyone`.
3. Nie używaj wildcardu `/api/bot/*` i nie zmieniaj polityk chroniących panel ani pozostałe API.
4. Potwierdź, że `/dashboard` i `/api/panel/...` nadal wymagają Access, a podobne ścieżki callbacka nie korzystają z
   wyjątku.

Bypass wyłącza zabezpieczenia i logi warstwy Access tylko dla tej ścieżki. Właściwą ochroną publicznego ingressu
callbacka pozostaje obowiązkowa weryfikacja Google OIDC w Workerze.

## Lokalna weryfikacja

Najpierw zbuduj i uruchom docelowy runtime:

```powershell
npm run build
npm run preview
```

Używaj wyłącznie syntetycznych body. Nie wklejaj bearer tokena do dokumentacji, historii poleceń, pliku ani zgłoszenia.
Bez tokena można bezpiecznie sprawdzić granicę metody i fail-closed auth:

```powershell
Invoke-WebRequest -Method Get -Uri http://localhost:4321/api/bot/google-chat -SkipHttpErrorCheck
Invoke-WebRequest -Method Post -Uri http://localhost:4321/api/bot/google-chat -ContentType application/json -Body '{"type":"MESSAGE"}' -SkipHttpErrorCheck
```

Oczekuj odpowiednio `405` oraz `401`, jeśli lokalne audience jest ustawione. Po usunięciu audience i restarcie drugi
request zwraca `503`. Statusy wymagające poprawnego Google tokena (`400`, `413`, `415`, `200`, `204`) weryfikuj przez
ograniczoną konfigurację testową Google Chat wskazującą publicznie dostępny HTTPS endpoint; nie dodawaj dev-only bypassu
ani lokalnego współdzielonego sekretu.

## Logi i diagnostyka

Uruchom tail produkcyjnego Workera:

```powershell
npx wrangler tail --format json
```

Każde żądanie emituje jeden rekord. Dozwolone pola to wyłącznie:

- `requestId`,
- `eventType` — dopiero po poprawnej walidacji body,
- `outcome`,
- `status`,
- `durationMs`.

Statusy `2xx` i oczekiwane `4xx` trafiają na poziom informacyjny, a `5xx` na poziom błędu. Nie loguj nagłówka
Authorization, tokena, body, treści wiadomości, e-maila, display name, identyfikatora użytkownika ani surowego wyjątku.
Przykładowe żądania muszą zawierać wyłącznie dane syntetyczne.

## Checklista operatora

- Google Chat API jest włączone, a aplikacja widoczna tylko dla testerów.
- Endpoint i Authentication Audience są identycznym adresem HTTPS.
- Worker ma `GOOGLE_CHAT_AUDIENCE`; repozytorium nie zawiera jego produkcyjnej wartości ani sekretów.
- Access omija tylko dokładny callback; panel i pozostałe API nadal są chronione.
- `MESSAGE` zwraca tekst, `REMOVED_FROM_SPACE` nie zwraca wiadomości.
- Log zawiera wyłącznie zatwierdzoną allowlistę i jeden rekord na request.

## Oficjalne źródła

- [Google Chat: verify requests](https://developers.google.com/workspace/chat/verify-requests-from-chat)
- [Google Chat: receive and respond to interactions](https://developers.google.com/workspace/chat/receive-respond-interactions)
- [Cloudflare Access: application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Cloudflare Access: bypass a public endpoint](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/#bypass-a-public-endpoint)
- [`jose`: JWT verification](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)
