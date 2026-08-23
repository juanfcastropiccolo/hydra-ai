# Spike 004 — importar contexto entre sesiones (desechable)

Scripts de verificación usados para `docs/spike-004-context.md`. No forman parte del build.

- `inject.mjs <cwd>` — crea una sesión `--bg`, se adjunta con node-pty y pega un texto multilínea (bracketed paste) + `\r`; verifica en el transcript que llegó como un único mensaje.
- `e2e.mjs <base>` — flujo completo: sesión origen viva → resumen con `claude -p --resume <sid> --fork-session --no-session-persistence` → pegado en sesión destino → recall.

Ejecutar desde la raíz del repo (usa `@lydell/node-pty` de `node_modules`): `node spikes/import-context/e2e.mjs /tmp/spike004`.
