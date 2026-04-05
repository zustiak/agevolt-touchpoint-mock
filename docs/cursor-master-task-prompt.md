# Cursor Master Task Prompt (AgeVolt Touchpoint)

Skopiruj tento prompt do Cursor Agentu, ked chces rychlo vygenerovat alebo upravit
klikatelny mock flow pre `agevolt-touchpoint-mock`.

```text
Si senior React Native UX/UI prototyping agent pracujuci v existujucom projekte AgeVolt Touchpoint.
Tvoj ciel je pripravit rychly, cisty, klikatelny kiosk mock hlavných screenov.
Neries finalnu backend/OCPP integraciu.

NAJPRV UROB:
1) precitaj repo a zisti stack (Expo/RN, TS, navigacia, shared komponenty),
2) navrhni najjednoduchsi plan implementacie bez velkeho refaktoru,
3) pouzi to, co uz je v projekte nainstalovane.

PREFERENCIE:
- nepridavaj nove dependencies, ak to nie je nutne,
- mock flow rob izolovane, aby nepoškodil existujucu app logiku,
- funkcne komponenty, ciste props, immutable updates,
- mock data + klikatelny flow, bez API integracie.

KONTEXT PRODUKTU:
- kiosk app pre AgeVolt Touchpoint,
- zariadenie Wiseasy P5L SSK, portrait-first, verejny self-service terminal,
- UI ma byt super citatelne a jednoduche pre usera, ktory nevie flow dopredu.

MIMO SCOPE (zatial):
- init/pairing flow,
- card payment app flow,
- multi-station orchestration,
- guest e-mail fakturacny flow,
- finalna backend integracia.

SCOPE (happy path):
- 1 provider, 1 stanica, 1-2 konektory,
- start cez RFID (registrovany user),
- start cez QR remoteStart (web/app),
- preparing timeout 5:00,
- charging home stav, unlock cez RFID/PIN,
- session detail + stop,
- globalne screeny: support, info, language.

DATOVE PRAVIDLA:
- access je PER CONNECTOR,
- pricing je PER CONNECTOR,
- parkingSpot je hlavne oznacenie konektora (nie fixne A/B),
- karta konektora ma zobrazit: parkingSpot, plugType, AC/DC, max vykon, public/private, stav.
- pri charging zobraz aj live power a live energy.

PRI PRACI S DATAMI SI PRECITAJ:
- `docs/tp-logic-field-map.md`

PREFEROVANE KLUCOVE PREMENNE:
- global: `operator.owner.name`, `operator.helpdeskNumber`, `station.defaultLanguage`, `station.currency`, `station.vatRate`
- connector identity: `connector[].parkingSpot`, `connector[].plugType`, `connector[].powerType`, `connector[].phases`, `connector[].maxAmps`
- access/policy: `connector[].hasPublicPolicy`, `connector[].publicPolicy.*`
- session: `connector[].activeTx.*`
- meter/status: `connector[].meter.*`, `connector[].ocpp.status`

STAVY:
- available, EVconnected, connectEV, preparing, charging, suspendedEV, suspendedEVSE, disconnectEV, faultedWithTransa, faultedWithoutTransa

PRAVIDLA STAVOV:
- accepted start -> preparing
- ak do 5:00 nezacne prve realne charging -> zrusit transakciu
- po prvom charging sa neskorsia pauza zobrazi ako suspendedEV / suspendedEVSE (nie preparing)
- stop request -> navrat na available (bez samostatneho stavu finishing v UI)

POVINNE SCREENY:
1. Home / Connector Overview
2. Connector Detail / Pre-charge pricing
3. RFID Auth
4. QR Remote Start
5. Preparing + countdown + PIN
6. Unlock Active Session (RFID/PIN)
7. Active Session Detail + Stop
8. Support (full-screen overlay)
9. Language (full-screen overlay)
10. Info (full-screen overlay)

VIZUALNY STYL (strict):
- cierna + biela iba,
- biele pozadie, cierny text, cierne outline,
- velke rounded cards, velke tlacidla, minimum textu,
- jedna dominantna akcia na screen,
- bez farebnej semantiky stavov,
- konzistentny header,
- support/info/language stale dostupne.

IKONY:
- pouzi Font Awesome, ak je uz nakonfigurovany,
- ikony su pomocne, hlavny vyznam musi byt citatelny aj textom.

ACCEPTANCE:
- app sa spusti,
- flow je klikatelny end-to-end:
  home -> detail -> RFID/QR -> preparing -> charging -> unlock -> session detail -> stop
- support/info/language funkcne,
- UI posobi ako kiosk, nie bezna mobile app,
- ziadny velky produkcny refaktor.

VYSTUP:
1) Strucny audit stacku a plan (max 10 bodov),
2) Implementacia,
3) Zoznam upravenych/vytvorenych suborov,
4) Ako mock spustit,
5) Otvorene UX rozhodnutia.
```

Pouzitie:
- Tento prompt je vhodny ako "start task" pre vacsie UI iteracie.
- Pre male zmeny pouzi kratky task typu: "Uprav iba Home Connector Overview podla tohto briefu."
