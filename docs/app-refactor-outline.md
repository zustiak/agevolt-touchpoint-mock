# App.tsx Refactor Outline

Aktualny stav po refactore:
- `connectorStatus.ts`: status cyklus, kratke overview labely a status helpery.
- `LocalQrCode.tsx`: lokalne QR renderovanie mimo `App.tsx`.

Odporucane dalsie rozdelenie `App.tsx`:

1. `components/connector/overview/`
- overview identity bubble
- overview metric/time bubbles
- fault / disconnect / idle overview variants

2. `components/connector/detail/`
- detail identity row
- idle start bubble
- session bubbles
- pricing/access/detail cards

3. `components/overlay/`
- `FullscreenOverlay`
- support content
- QR content
- service menu content

4. `components/info/`
- `InfoReader`
- help-page builder / topic-list UI

5. `lib/`
- time / price / formatting helpers
- connector access helpers
- connector session helpers

Prakticky postup:
- najprv presuvat ciste helpery bez JSX,
- potom izolovat kompletne JSX bloky, ktore maju uzavrete props,
- az nakoniec rozdelit velky `styles` objekt po feature oblastiach.
