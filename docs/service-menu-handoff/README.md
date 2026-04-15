# Service menu handoff for Cursor

Tento balík je pripravený ako náhrada za nefunkčný widget export. Je určený na to, aby Cursor vedel postaviť rovnaké servisné menu v novom projekte s novým UI.

Obsah balíka (v tomto repozitári pod `docs/service-menu-handoff/`):
- `reference/original/` – kľúčové originálne súbory vytiahnuté z `AgeVolt/pos-rn`
- `reference/original_manifest.md` – zoznam relevantných originálnych súborov
- Blueprint súbory sú v koreni tohto adresára (bez podpriečinka `blueprint/`): `service-menu.schema.json`, `service-menu.tree.md`, `cursor_handoff_prompt.md`, `src/types/`, `src/navigation/`, `src/state/`, `src/screens/`, atď.

Odporúčaný postup v Cursore:
1. Otvor `service-menu.schema.json` a `src/types/serviceMenu.ts` ako zdroj pravdy.
2. Použi `src/navigation/serviceMenu.routes.ts` na novú navigáciu.
3. Zaveď store podľa `src/state/serviceMenu.state.ts`.
4. Renderuj nové UI podľa `src/screens/*.ts`.
5. Keď potrebuješ 1:1 logiku zo starého projektu, pozri `reference/original/`.

Poznámka:
- Pôvodný Deep Research export negeneroval reálne download súbory. Preto je tento ZIP pripravený ručne.
- Kde nebolo praktické preniesť device-specific alebo veľmi naviazaný runtime 1:1, je pridaný vyčistený blueprint ekvivalent a pôvodný súbor je uvedený v manifeste.
