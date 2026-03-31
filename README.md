# AgeVolt Touchpoint Mock (Happy Path)

Klikatelny React Native mock pre kiosk UI (Wiseasy P5L SSK) so zameranim na pozitivny scenar nabijania.

## Scope tejto verzie

- Bez init flow.
- Bez card payment app flow.
- Jedna stanica, provider AgeVolt.
- 1 alebo 2 konektory.
- Start cez RFID alebo QR remote start.
- Preparing stav s 5:00 timeout simulaciou.
- Unlock aktivnej session cez RFID/PIN.
- Detail aktivnej session + stop do finishing.
- Global overlays: jazyk, podpora, info.

## Implementacny plan (realizovany)

1. Vytvorenie Expo + TypeScript projektu.
2. Definovanie mock modelu:
   - `Connector`,
   - `Pricing`,
   - `Session`.
3. Vytvorenie screen state machine v `App.tsx`.
4. Implementacia komponentov:
   - `TopHeader`,
   - `HomeScreen` s `ConnectorCard`,
   - `ConnectorDetailScreen`,
   - `RfidScreen`,
   - `QrStartScreen`,
   - `PreparingScreen`,
   - `UnlockScreen`,
   - `SessionDetailScreen`,
   - `SimpleOverlay`.
5. Pridanie demo scenarov a internych toggle akcii.

## Dostupne demo scenare

- `1x Public`
- `Public + Private`
- `1x Charging + 1x Free`

## Klikatelny flow

### RFID start

1. Home -> klik na dostupny konektor.
2. Detail -> `Prilozit RFID kartu`.
3. RFID -> `Simulovat RFID OK`.
4. Preparing -> `Simulovat zaciatok nabijania`.
5. Home (charging) -> klik na nabijaaci konektor.
6. Unlock -> RFID alebo PIN.
7. Session detail -> `Zastavit nabijanie`.
8. Home (finishing) -> `Spristupnit`.

### QR remote start

1. Home -> detail public konektora.
2. `Naskenovat QR kod`.
3. `Simulovat remoteStart Accepted`.
4. Pokracovanie cez preparing -> charging.

## Spustenie

```bash
cd agevolt-touchpoint-mock
npm install
npm run web
```

Alebo mobilny preview:

```bash
npm run android
```

## Poznamky

- Vsetky data su mock; ziadna backend/OCPP integracia.
- Cierna/biela visual baseline je nastavena pre kiosk citatelnost.
- Texty su zamerne kratke a stavovo orientovane.
