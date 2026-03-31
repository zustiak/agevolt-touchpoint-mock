# AgeVolt Touchpoint - Project Brief (AI baseline)

Tento dokument je zakladny kontext pre AI asistenta v projekte `agevolt-touchpoint-mock`.
Je urceny na navrh a iteracie UI, nie na finalnu backend integraciu.

## 1) Co je to za produkt

AgeVolt Touchpoint je kioskova React Native aplikacia bezne spustena na zariadeni
`Wiseasy P5L SSK` (self-service terminal pri nabijacej stanici).

Pouzivatel je fyzicky pri stojane, nepozna system dopredu, a potrebuje:
- rychlo pochopit stav konektorov,
- vidiet cenu pred startom,
- vediet ako nabijanie spustit,
- pocas nabijania vediet odomknut detail a pripadne zastavit nabijanie,
- mat po ruke podporu a zmenu jazyka.

## 2) Hardverovy kontext (Wiseasy P5L SSK)

Z dostupnej produktovej specifikacie (official page):
- 5.5" dotykovy displej, `720 x 1280`, orientacia portrait,
- WiseOS 3.0 (Android 11 base),
- 2 GB RAM / 32 GB eMMC,
- NFC + IC card podpora,
- 2G/3G/4G, Wi-Fi, Bluetooth, GPS,
- robustnejsie nasadenie v self-service prostredi (vyrobca uvadza IP64 / IK08).

Dosledok pre UI:
- velke prvky, vysoka citatelnost, minimum drobnych detailov,
- bez preplnenia obrazovky, bez komplikovanych flow,
- navrh orientovany na kiosk, nie na klasicku mobilnu app.

## 3) Scope aktualnej iteracie (happy path)

V tejto faze riesime iba:
- 1 stanica / 1 provider,
- 1 alebo 2 konektory na home screene,
- start nabijania cez RFID (registrovany user),
- start nabijania cez QR remote start (web / mobilna app),
- preparing timeout 5:00,
- unlock aktivnej session cez RFID alebo 6-miestny PIN,
- detail aktivnej session + stop,
- globalne: `Info`, `Support`, `Language`.

Zatial neriesime:
- init/pairing flow,
- card payment app flow,
- multistanicovy orchestration flow,
- backend API/OCPP integraciu (mock data only).

## 4) Kiosk UX a vizualny smer

Povinne pravidla:
- striktne cierna + biela (vysoky kontrast),
- biele pozadie, cierny text, cierne bordery,
- velke rounded cards a velke touch targety,
- minimum textu, jasna hierarchia, jedna dominantna akcia na screen,
- status komunikovat textom (ikona je sekundarna),
- support/info/jazyk dostupne stale a konzistentne.

Overlay pattern:
- sekundarne obrazovky preferovat ako full-screen panel s velkym `X` vpravo hore,
- nepouzivat male mobilove modaly, ak to nie je nutne.

## 5) Data model principy (UI vrstva)

Klucove je, ze logika je **per connector** (nie per station):
- access (`public` / `private`) je per connector,
- pricing je per connector,
- status je per connector,
- meter a activeTx su per connector.

Minimum dat pre connector card:
- `id`,
- `parkingSpot` (hlavne oznacenie, typicky do 5 znakov),
- `plugType`,
- `powerType` (`AC`/`DC`),
- `maxPowerKw`,
- `accessType`,
- `status`,
- pri charging: `livePowerKw`, `liveEnergyKwh`.

Pricing breakdown (ak je dostupny):
- energy price (kWh),
- charging/session unit fee (ak existuje),
- parking fee,
- grace period minutes,
- grace period starts from (`start` alebo `end` charging),
- occupy fee per hour,
- currency.

## 6) Minimalny screen inventory

1. `Home / Connector Overview`
- hlavna obrazovka, 1-2 connector cards (preferovane vedla seba, ak zostane citatelnost),
- zobrazi parkingSpot, plugType, AC/DC, max vykon, public/private, stav,
- pri charging aj live vykon + spotreba.

2. `Connector Detail / Pre-charge`
- detail konektora + cennik pred startom,
- CTA: RFID a (ak public) QR remote start.

3. `RFID Auth`
- cakanie na kartu, accepted / denied feedback.

4. `QR Remote Start`
- velky QR panel, navod na pokracovanie vo webe/app,
- po accepted sa napoji na rovnaky flow ako RFID.

5. `Preparing`
- stav preparing, countdown 5:00, session PIN, instrukcia pripojit vozidlo.

6. `Unlock Active Session`
- odomknutie cez RFID alebo PIN.

7. `Active Session Detail`
- cas, vykon, energia, cena, rozpis ceny, stop charging.

8. `Support` (full-screen overlay)
- telefon + e-mail.

9. `Language` (full-screen overlay)
- velke volby jazykov.

10. `Info` (full-screen overlay)
- co znamenaju ikony/stavy, kratky flow navod.

## 7) Stavovy model (UI logika)

Pouzivane stavy:
- `available`
- `preparing`
- `charging`
- `suspended`
- `finishing`
- `faulted`

Pravidla:
- accepted start -> `preparing`,
- ak do 5:00 nenastane prve realne charging -> zrusit transakciu, navrat na `available`,
- po prvom realnom charging uz pri pauze pouzit `suspended` (nie `preparing`),
- stop request -> `finishing` -> az potom `available`.

## 8) UX pravidla pre access a pricing

- `private` konektor:
  - pred autorizaciou zobrazit, ze je len pre opravnenych registrovanych userov,
  - po RFID denied: jasna hlaska "tento RFID nema pristup k nabijaniu",
  - po RFID accepted: zobrazit userovu cenu a pokracovat.
- `public` konektor:
  - mozne RFID aj QR start,
  - QR flow moze byt aj pre neregistrovaneho usera.

## 9) Implementacna strategia pre mock

- Preferovat male reusable komponenty a jednoduchy state-machine pristup.
- Zachovat izolovany mock flow, aby sa neposkodila existujuca produkcna logika.
- Nepouzivat zbytocne nove kniznice; najprv vyuzit to, co je v projekte.
- Najprv iterovat UX a obsah screenov, potom visual polish.

## 10) Definition of Done pre tuto fazu

Hotovo pre tuto fazu znamena:
- klikatelny happy-path flow existuje end-to-end,
- obrazovky su konzistentne, citatelne, kioskove,
- cierna/biela vizualna disciplina je dodrzana,
- support, info, jazyk su dostupne globalne,
- mock je dostatocne stabilny na dalsiu iteraciu "screen po screene".

## 11) Doplnenie z TP logic.xlsx

Na presne mapovanie premennych a source-of-truth pravidiel pouzi:
- `docs/tp-logic-field-map.md`

Najdolezitejsie body z excelu:
- Priorita zdrojov pre `INIT + OCPP_KEY`: OCPP_KEY ma prednost.
- Remote start/stop sa po akceptovani napaja na rovnaky lokalny TX state machine ako lokalne akcie.
- `preparing` je iba pred prvym realnym charging; potom pri pauze patri stav `suspended`.
- Stop nie je okamzity koniec: najprv wait safe state, potom `finishing`, az potom `available`.
- Per-connector data model je potvrdeny (`connector[].*` pre status, pricing, tx, meter).
