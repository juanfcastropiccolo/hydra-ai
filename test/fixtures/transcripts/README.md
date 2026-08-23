# Fixtures de transcripts (feature 005)

Estructura espejo de `~/.claude/projects/`:

- `-Users-dev-work-demo/aaaaaaaa-…001.jsonl` — **sesión real corta saneada** (Claude Code 2.1.241, 2026-08-10): textos reemplazados por `lorem ipsum (N chars)`, rutas → `/Users/dev/work/demo`, título → `Demo session title`, ids de sesión reescritos; `usage`, `message.id`, `requestId`, tipos de registro y orden intactos. Nota: el mismo `usage` se repite en cada bloque (thinking/text/tool_use) de una misma respuesta → deduplicar por `message.id`. Esperado: 3 mensajes del asistente, tokens in 6 / out 851 / cache write 17 246 / cache read 98 055 (modelo `claude-fable-5`), 1 turno humano (los otros 2 `user` son `tool_result`), `Bash` ×2, `turn_duration` 27 221 ms, título "Demo session title".
  - `aaaaaaaa-…001/subagents/agent-x.jsonl` — sub-agente sintético (haiku: 3/30/300/3000, `Read` ×1) que debe sumarse al padre.
- `-Users-dev-work-demo/bbbbbbbb-…002.jsonl` — sintética: `custom-title` gana a `ai-title`; dos días/horas distintos (2026-08-11 13:15Z y 2026-08-12 22:40Z); dos modelos; `usage` sin campos de caché; una línea rota y una vacía; `user` con `isMeta` (no es turno); `tool_result`; `turn_duration` ×2 (19 000 ms). Esperado: 2 turnos humanos, 3 mensajes del asistente, opus 15/150/1000/5000, haiku 7/70/0/700, `Read` ×1, `Bash` ×2, 2 líneas ignoradas.
- `-Users-dev-work-demo/dddddddd-…004.jsonl` — vacía (se ignora sin error).
- `-Users-dev-work-demo/eeeeeeee-…005.jsonl` — solo un mensaje de usuario (sin asistente).
- `-private-tmp-scratch/cccccccc-…003.jsonl` — sesión en carpeta temporal: **excluida** por FR-10b.
