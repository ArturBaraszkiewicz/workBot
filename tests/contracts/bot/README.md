# Kontrakt zachowania bota F-01

Ten katalog jest wykonywalnym kontraktem roadmapowego elementu **F-01 `preserved-bot-contract`**. Aktywny folder
workflow zachowuje wcześniejszy identyfikator `gate-product-routes`; obie nazwy opisują tę samą zmianę.

## Zakres i źródła

Nadrzędnym źródłem zachowania jest `context/foundation/prd.md`, zwłaszcza US-01, FR-008 i FR-009. `app.js` jest
wyłącznie dowodem pochodzenia aliasów, przejść stanu i historycznych obliczeń czasu. Kontrakt nie importuje ani nie
uruchamia bundla. Nie zależy też od Astro, Supabase, sieci ani systemu plików.

Kontrakt obejmuje rodziny komend:

- `/start`, `/rozpocznij`, `/hi`;
- `/stop`, `/koniec`, `/zakoncz`, `/bb`, `/end`, `/adios`;
- `/break`, `/przerwa`, `/zw`, `/brb`;
- `/endbreak`, `/koniecprzerwy`, `/jj`;
- `/office`, `/biuro`, `/status`;
- `/who`, `/kto` wraz z filtrem biura, zespołu i roli.

`types.ts` definiuje neutralną granicę adaptera. `fixtures.ts` zawiera wyłącznie syntetyczne osoby i oczekiwane stany.
`contract-suite.ts` eksportuje `registerBotContract()`, które przyszłe slice'y S-04 i S-05 mogą uruchomić wobec
izolowanego adaptera produktu.

## Polityka zgodności

- Odpowiedzi są sprawdzane wyłącznie jako schemat `{ text: string }` albo legacy card envelope. Kontrakt celowo nie
  zamraża tekstu, interpunkcji, kolejności słów ani lokalnego formatu godziny. Poprawny kształt z błędną treścią nie
  zostanie wykryty przez F-01.
- Poprawny token `HH:MM` jest osadzany w bieżącym dniu kontrolowanego zegara. Jak w prototypie, nie sprawdzamy
  kolejności: przyszłe czasy, odwrócone przerwy i ujemne wyniki są dozwolone. Token niepasujący do wzorca jest
  ignorowany, a pasujący, lecz spoza zakresu `00:00`–`23:59`, jest odrzucany.
- Czas pracy to pełne minuty od startu do końca (lub kontrolowanego `now`) pomniejszone o zakończone przerwy. `/stop`
  zamyka otwartą przerwę swoim czasem.
- Zgodnie z PRD `/who` jest firmowe i pokazuje wyłącznie obecnie pracujących. Osoba na przerwie nadal pracuje; osoba,
  która zakończyła dzień, jest wykluczona. Jest to świadome odejście od historycznego `app.js`.
- `activeAnnouncement` jest jedynie opcjonalnym wejściem `/start` przygotowanym dla S-04. F-01 nie pobiera, nie
  przechowuje i nie publikuje ogłoszeń HR.

Jawne odstępstwa i ich klasyfikacje znajdują się w `PROTOTYPE_DEVIATIONS`. Nie przenosimy znanych defektów prototypu:
zakończonych osób w `/who`, starego `endTime` i przerw po wznowieniu, podwójnych jednostek raportu ani konkretnych
historycznych tekstów odpowiedzi.

## Użycie przez adapter produktu

Adapter otrzymuje syntetycznych użytkowników, stan początkowy i kontrolowany zegar. Po każdej komendzie zwraca payload,
wynik przejścia, pełny stan oraz — gdy fixture tego wymaga — minuty pracy albo identyfikatory widoczne w `/who`.
Podłączenie testów nie wymaga importowania kodu Astro lub Supabase do kontraktu:

```ts
import { registerBotContract } from "./contract-suite";

registerBotContract((context) => createProductAdapter(context));
```

Sam `contract-definition.test.ts` sprawdza spójność definicji, a nie udaje implementacji bota. Zgodność produktu zaczyna
być dowodzona dopiero po podłączeniu realnego adaptera w S-04/S-05.
