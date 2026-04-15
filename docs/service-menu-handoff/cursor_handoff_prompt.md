Goal:
Build a new service menu UI in a new project, but keep the behavior and data model aligned with the extracted AgeVolt POS service menu.

Rules:
- Use `blueprint/service-menu.schema.json` as source of truth for screens, fields, quick actions and permissions.
- Use a fresh UI. Do not copy old styling.
- Keep screen ids and route ids stable.
- Keep service/admin guards where the product requires them.
- Touchpoint mock: service menu is always reachable after 5× logo + correct service PIN (no block during active charging).
- Keep browser allowlist support; default to fixed support URLs only.
- Keep firmware update and connector config as separate deep screens.
- Keep state split into: config, connectivity, station, connectors, runtime.
- Keep quick actions explicit and auditable.

Output expectations:
- New React Native or React web admin UI.
- Typed routes.
- Centralized state.
- Mock mode for development.
- Device/API adapters behind interfaces.
