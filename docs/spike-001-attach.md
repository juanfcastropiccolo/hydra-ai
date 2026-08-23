# Spike 001 — `claude attach` dentro de xterm.js en Electron

Fecha: 2026-08-23 · Máquina: MacBook Intel i7 (x86_64), macOS 14.8.3 · Claude Code 2.1.241 · Electron 43.4.1 · @xterm/xterm 6.0.0 · @lydell/node-pty 1.1.0 (prebuilt darwin-x64, sin compilar).
Código: `spikes/attach-xterm/` (desechable; no forma parte de `src/`). Ejecutar: `cd spikes/attach-xterm && npm i && node node_modules/electron/install.js && npm start`.

## Pregunta

¿Una sesión background de Claude Code adjuntada con `claude attach <id>` (que renderiza **siempre** en modo fullscreen / alternate screen) se ve y se opera correctamente dentro de xterm.js en Electron, con PTY real vía node-pty?

## Procedimiento

Ventana Electron con un xterm; botón que ejecuta `claude --bg --name spike-N` (sin prompt) en un cwd temporal y luego `claude attach <id>` dentro de una PTY node-pty. Verificación manual por el autor, con y sin `CLAUDE_CODE_DISABLE_MOUSE=1`.

## Resultados (verificación manual, Juan, 2026-08-23)

| #   | Criterio                                     | Resultado                                                                            |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| a   | TUI se dibuja limpio (sin basura/duplicados) | ✅ "se ve perfecto"                                                                  |
| b   | Scroll con rueda sobre la conversación       | ✅ funciona                                                                          |
| c   | Selección arrastrando + copiar               | ✅ funciona (mouse on y mouse off)                                                   |
| d   | Resize de ventana redibuja bien              | ✅ (log: `resize → 71x32 … 126x41`, sin artefactos)                                  |
| e   | Detach (`Ctrl+Z`) no mata la sesión          | ✅ el cliente sale; la sesión sigue en el daemon; re-adjuntable                      |
| f   | `CLAUDE_CODE_DISABLE_MOUSE=1`                | Sin diferencia perceptible; **no hace falta**. Queda como opción futura, no default. |
| g   | `stop`+`rm` con cliente adjunto              | El cliente imprime "Session … has exited" y sale limpio (exit 0). Base para FR-19.   |

### Tiempos medidos (log del main process)

| Intento                                           | `--bg`   | primeros bytes del `attach` (desde el clic) |
| ------------------------------------------------- | -------- | ------------------------------------------- |
| 1.º (daemon frío, "Starting background service…") | 2 135 ms | **7 273 ms**                                |
| 2.º (daemon caliente)                             | 1 314 ms | 2 435 ms                                    |
| 3.º                                               | 1 354 ms | 2 307 ms                                    |

### Hallazgos laterales

- **PATH:** `$SHELL -ilc 'echo $PATH'` (login **interactivo**) hizo **timeout a los 5 s** en esta máquina (el `.zshrc` tiene algo lento/interactivo). El fallback a `~/.local/bin/claude` funcionó. → `EnvResolver` usa `-lc` (login, no interactivo), timeout 3 s, y fallbacks `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`.
- **Electron en Node 20:** el postinstall de `electron` no descargó el binario (engine `>=22.12`); hubo que correr `node node_modules/electron/install.js`. El setup real debe usar Node ≥22 o documentar ese paso.

## Decisiones

1. **Se confirma la arquitectura del plan:** `--bg` + `attach` en PTY propia; fullscreen es correcto en xterm.js. ADR-4 de la Constitution queda cerrada.
2. **`CLAUDE_CODE_DISABLE_MOUSE` no se setea por defecto.**
3. **AC-2b** (<5 s) se cumple con daemon caliente; la primera sesión con daemon frío tarda ~7 s. Se aplica la contingencia prevista en el plan (Riesgo 7): AC-2b pasa a "<5 s con daemon activo; <8 s la primera sesión". Hydra intentará calentar el daemon al arrancar si hay proyectos registrados (tarea 22).
4. **`EnvResolver`:** `-lc` + timeout 3 s + fallbacks (tarea 6).
5. El spike se conserva en `spikes/attach-xterm/` como referencia ejecutable, fuera del build.

## Veredicto

**GO.** Sin bloqueantes; se continúa con la Fase 1 (setup) sin cambios de plan.
