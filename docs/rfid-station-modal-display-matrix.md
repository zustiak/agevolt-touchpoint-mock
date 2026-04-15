# RFID modál stanice — čo sa kde zobrazuje

Zjednodušená matica **bez** úplného kartézkeho súčinu všetkých OCPP stavov. Platí **mock** a aktuálna logika v `buildStationConnectorDecision` + UI v `StationRfidConnectorPanel`.

## Horná bublina (karta)

| Stav karty | Obsah |
|------------|--------|
| **Neznáma** | UID karty → **Neznáma karta** + riadok **Možný eŠtart cez Roaming** → tlačidlo **Pridať do konta** (bez ikony karty; otvorí prihlásenie). Bez prevádzkovateľa / vozidla / mailu. |
| **Známa, blokovaná** | UID → banner **Karta je blokovaná** → (ak sú v mocku) prevádzkovateľ, vozidlo, mail. |
| **Známa, aktívna** | UID → prevádzkovateľ, vozidlo, mail podľa mocku. |

**Pätička modálu:** vždy len **Zavrieť** (Pridať kartu je v hornej bublinke).

## Bublina konektora (pre každý konektor)

Vždy: **názov konektora** (parkovacie miesto).

| Podmienka | Ďalší obsah |
|-----------|-------------|
| Aktívna TX na konektore, **autorizovaná karta** (skenovaný UID alebo `parentTag` karty = `activeTx.rfidTag` / `activeTx.parentTag` / `linkedCardUid`) a `costWithVat > 0` | Jedna riadková suma (`txTotalCostLabel`). |
| Inak (cudzia TX alebo suma 0) | Bez sumy. |

**Štart** je len v stavoch konektora: **Voľný** (`available`), **Vozidlo pripojené** (`EVconnected`), **Odpojte vozidlo** (`disconnectEV`) — pozri `isRfidStationModalStartableStatus` v `connectorStatus.ts`.

**Poradie v bubline (zhora):** najprv **Detail** (vždy), potom podľa platnosti: **Stop** (`canStop`), **Start** / **eŠtart** (eRoaming) (`canStart` / `canStartRoaming`), prípadne riadok **ikona zákazu** (`do-not-enter`), ak nie je Stop ani štart (ani eRoaming) a nie ide o blokovanú kartu s TX (tam je len Detail).

## Kríž: typ karty × situácia na konektore (zjednodušene)

**Karta neznáma**

- Konektor voľný, **nie** eRoaming: ikona blok + Detail; žiadny štart (potrebné konto).
- Konektor voľný, **je** eRoaming: tlačidlo eRoaming (`rfid.station.action.startRoaming`) + Detail.

**Karta známa, blokovaná**

- Voľný konektor: ikona blok + Detail (štart nie).
- Nabíja sa TX **na tejto karte**: **Stop** + suma (ak > 0) + Detail.
- Nabíja sa **cudzia** TX: ikona blok + Detail (Stop nie je pre túto kartu).

**Karta známa, aktívna**

- Voľný, politika povolí štart: **Start** + Detail.
- Voľný, politika zakáže (napr. len privát): ikona blok + Detail.
- Chýba politika účtu na konektore: ikona blok + Detail.
- Aktívna TX na tejto karte: **Stop** + suma (ak > 0) + Detail.
- Aktívna cudzia TX: ikona blok + Detail.

**Porucha konektora (`faultedWithoutTransa`)**

- Ikona blok + Detail (štart ani stop v mocku nie).

---

Logika je v `rfidStationLogic.ts` (`buildStationConnectorDecision`). UI bubliny konektorov v `StationRfidConnectorPanel` v `App.tsx`.
