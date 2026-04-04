# TP Logic Field Map (from `docs/TP logic.xlsx`)

Tento dokument je vytiahnuty zo sheetu `Variables` a suvisiacich sheetov
(`TX_AND_CHARGING_STATE`, `OCPP_STATUS_NOTIFICATION`, `OCPP_REMOTE_START_STOP`, `ENUM SOURCE`).
Je to referencny most medzi UI mockom a buducou runtime logikou.

## 1) Source-of-truth vrstvy

- `INIT` = data z backend init procedury
- `OCPP_KEY` = konfiguracia z OCPP key-value
- `OCPP_RUNTIME` = runtime data z OCPP toku (tx, meter-values flow, status send history)
- `EVM` = data z EV modulu
- `ELM` = data z elektromera
- `DERIVED` = odvodene hodnoty vypocitane lokalne
- `LOCAL_ACCUMULATOR` = lokalne perzistentne pocitadla

Priority pravidlo z excelu:
- Ak premenna ma `INIT + OCPP_KEY`, tak:
  - `INIT` je insert-only,
  - `OCPP_KEY` je upsert,
  - `OCPP_KEY` ma prednost.
- Ak ma premenna iba `INIT` (bez `OCPP_KEY`), `INIT` je upsert.

## 2) Global fields pre UI shell

- `operator.owner.name` (INIT + OCPP_KEY)
- `operator.helpdeskNumber` (INIT + OCPP_KEY)
- `station.defaultLanguage` (INIT + OCPP_KEY)
- `station.currency` (INIT)
- `station.vatRate` (INIT)
- `system.online` (SYSTEM_ANDROID_NET)
- `system.activeNetwork` (SYSTEM_ANDROID_NET)
- `system.ocppConnected` (DERIVED)
- `system.mqttConnected` (DERIVED)

Poznamka: helpdesk e-mail zatial nie je explicitne v Variables liste, preto moze byt mock/static.

## 3) Per-connector fields pre Home a Detail

Identity a capability:
- `connector[].parkingSpot` (INIT)
- `connector[].plugType` (INIT)
- `connector[].powerType` (INIT)
- `connector[].phases` (INIT)
- `connector[].maxAmps` (INIT)
- `connector[].evseCpoId` (INIT)

Access a pricing:
- `connector[].hasPublicPolicy` (DERIVED)
- `connector[].publicPolicy.price` (INIT)
- `connector[].publicPolicy.validTo` (INIT)
- `connector[].publicPolicy.policyEndUtc` (INIT)
- `connector[].publicPolicy.withoutTimeSchedule` (INIT)
- `connector[].publicPolicy.scheduleActiveNow` (INIT)
- `connector[].publicPolicy.schedule[]` (INIT)

Runtime charging/session:
- `connector[].activeTx.id` (OCPP_RUNTIME)
- `connector[].activeTx.tagId` (OCPP_RUNTIME)
- `connector[].activeTx.userId` (OCPP_RUNTIME)
- `connector[].activeTx.hasReachedCharging` (DERIVED)
- `connector[].activeTx.priceMeta` (OCPP_RUNTIME)
- `connector[].activeTx.chargingTime` (OCPP_RUNTIME)
- `connector[].activeTx.costWithVat` (OCPP_RUNTIME)
- `connector[].activeTx.vatRate` (OCPP_RUNTIME)
- `connector[].activeTx.chargingStartTs` (OCPP_RUNTIME)
- `connector[].activeTx.chargingEndTs` (OCPP_RUNTIME)

Metering and status:
- `connector[].meter.energy` (ELM OR EVM)
- `connector[].meter.power` (ELM OR EVM)
- `connector[].meter.voltage.phase[]` (ELM)
- `connector[].meter.current.phase[]` (ELM)
- `connector[].meter.state` (ELM)
- `connector[].ocpp.status` (DERIVED)

## 4) Stavove pravidla do UI (happy path)

Podla `TX_AND_CHARGING_STATE` + `OCPP_STATUS_NOTIFICATION`:

- Start accepted -> connector ide do `preparing`.
- V `preparing` ostava az po prvy realny prechod do charging.
- Ak 5 minut neprejde do prveho charging, transaction sa zrusi.
- Po prvom charging pri navrate do 9V je stav `suspended` (nie `preparing`).
- Stop request -> budget 0 -> wait safe stop state -> `finishing` -> `available`.
- Remote start/stop po accept ide do toho isteho lokalneho TX flow ako lokalny start/stop.

## 5) Remote-start obmedzenia do UX

Podla `OCPP_REMOTE_START_STOP`:

- `RemoteStartTransaction` sa akceptuje len ak request obsahuje konkretny connector.
- Charging profile v remote start requeste sa v tejto verzii ignoruje.
- Remote start reject, ak connector ma aktivnu transakciu alebo je vo fault stave.
- `RemoteStopTransaction` sa akceptuje len pri zhode `transactionId` na aktivnu tx.

## 6) Co z toho aplikovat uz teraz v mocku

- UI pomenovania a strukturu dat drzat co najblizsie k uvedenym klucom.
- Mock adapter ma vracat aspon:
  - global: `operator.owner.name`, `operator.helpdeskNumber`, `station.defaultLanguage`, `station.currency`
  - connector: `parkingSpot`, `plugType`, `powerType`, `maxAmps/phases`->`maxPowerKw`, `hasPublicPolicy`,
    `publicPolicy.price`, `activeTx.*`, `meter.power`, `meter.energy`, `ocpp.status`
- Statusy mapovat na kiosk copy:
  - `available`, `preparing`, `charging`, `suspended`, `finishing`, `faulted`
