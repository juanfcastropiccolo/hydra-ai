# Fixtures de `claude agents --json`

- `agents-live-capture.json` — captura real (2026-08-23, Claude Code 2.1.241): dos sesiones `interactive` (`status: idle` y `busy`). Nota: las interactivas usan el vocabulario `idle|busy`, sin `id` ni `state`.
- `agents-bg-idle-noprompt.json` — captura real (spike): sesión `background` recién creada sin prompt → `status: idle`, `state: blocked`.
- `agents-bg-working.json`, `agents-bg-waiting-permission.json`, `agents-bg-waiting-input.json`, `agents-bg-done.json`, `agents-bg-stopped-nopid.json` — **sintéticas**, construidas a partir de la documentación oficial de agent view (campos `state: working|blocked|done|failed|stopped`, `status: working|waiting`, `waitingFor`). Revalidar contra capturas reales cuando se tengan.
- `agents-mixed.json` — mezcla de todo lo anterior para tests de agrupado.
- `agents-empty.json`, `agents-invalid.txt`, `agents-garbage-prefix.txt` — bordes.
