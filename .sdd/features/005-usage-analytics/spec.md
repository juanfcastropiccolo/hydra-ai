# Analytics de uso

Feature ID: 005
Status: complete (2026-08-23)
Last updated: 2026-08-23

## Problem

Uso Claude Code muchas horas por día en varios proyectos y no tengo forma de ver cuánto consumo (tokens, costo equivalente), en qué proyectos se va, cuándo trabajo más, ni qué sesiones fueron caras o largas. Toda esa información ya está en los transcripts locales que Claude Code guarda en mi máquina, pero dispersa en decenas de archivos JSONL de megabytes. Falta, dentro de Hydra, una vista de analíticas que los lea, los resuma y me muestre uso y actividad de un vistazo, con el mismo cuidado visual que el resto de la app.

## Users

- **Juan (y cualquier dev Mac con Hydra):** quiere abrir una vista y ver en segundos cuánto usó Claude hoy / esta semana / este mes, en qué proyectos, con qué modelos, a qué horas, y cuáles fueron las sesiones más pesadas. Quiere que se vea **moderna y cuidada** ("canchera"), no un panel de administración genérico.

## Desired outcome

Pulso **Analytics** en la barra lateral y el área central pasa de la grilla de terminales a un dashboard oscuro, limpio y con buena tipografía: arriba elijo el rango (Hoy · 7 días · 30 días · Todo · personalizado) y opcionalmente un proyecto; veo tarjetas con los números grandes (tokens, costo estimado, sesiones, turnos, tiempo de Claude trabajando) y cómo cambiaron respecto del período anterior; debajo, un gráfico de uso por día apilado por modelo (puedo alternar tokens/costo), un mapa de calor de **hora × día de la semana** que muestra cuándo trabajo, barras por proyecto y un desglose por modelo. Al final, una tabla de sesiones (título, proyecto, inicio, duración, turnos, tokens, costo estimado, modelo, si está viva) que puedo ordenar. La primera vez tarda unos segundos en indexar con una barra de progreso; después es instantáneo, y se mantiene al día sola mientras trabajo. Pulso **Sessions** y vuelvo a la grilla, con las terminales exactamente como estaban.

## Functional requirements

### Navegación y vista

1. **FR-1 — Entrada:** el ítem **Analytics** de la barra lateral (hoy deshabilitado) se habilita y muestra la vista de analíticas **en el área central**, reemplazando visualmente la grilla de panes; **Sessions** vuelve a la grilla. Las terminales no se desmontan ni se re-adjuntan al cambiar de vista; siguen recibiendo salida y sus semáforos siguen actualizándose. La vista activa (Sessions/Analytics) persiste entre aperturas.
2. **FR-2 — Rango y filtros:** selector de rango **Hoy · 7 días · 30 días · Todo · Personalizado** (fecha desde/hasta) y un filtro por **proyecto** (todas las carpetas con transcripts; las registradas en Hydra se muestran con su nombre y destacadas; el resto con su ruta abreviada). Los filtros afectan a todas las secciones. El rango elegido persiste.
3. **FR-3 — Tarjetas resumen:** tokens totales (con desglose input / output / caché al pasar el mouse), **costo estimado** (marcado como estimado), sesiones, turnos, y **tiempo de Claude trabajando** (suma de la duración de los turnos). Cada tarjeta muestra la variación respecto del período anterior de igual longitud (↑/↓ %), salvo en "Todo".
4. **FR-4 — Uso por día:** gráfico de barras por día (o por semana cuando el rango supera 60 días) **apilado por modelo**, con conmutador **Tokens / Costo**. Al pasar el mouse, el detalle del día: total y por modelo. Los días sin uso se muestran vacíos (no se omiten).
5. **FR-5 — Cuándo trabajo:** mapa de calor **hora del día × día de la semana** con la intensidad de actividad (turnos o tokens; conmutable), en la zona horaria local. Tooltip con el valor.
6. **FR-6 — Por proyecto:** barras horizontales con tokens/costo por proyecto, ordenadas de mayor a menor, con el porcentaje del total; las de Hydra destacadas. Clic en una barra aplica el filtro de proyecto.
7. **FR-7 — Por modelo:** desglose (tokens, costo, % del total) por modelo usado en el rango.
8. **FR-8 — Tabla de sesiones:** una fila por sesión del rango: **título** (el título de la sesión si existe; si no, el primer mensaje del usuario recortado), proyecto, inicio, duración (primer→último mensaje), turnos, tokens (in / out / caché), costo estimado, modelo principal, y un indicador **viva** si la sesión está activa ahora según Hydra. Ordenable por cualquier columna; por defecto por inicio descendente. Clic en una sesión viva → la enfoca en la grilla (vuelve a Sessions); en una terminada no hace nada en esta versión.
9. **FR-9 — Costo estimado:** se calcula con una **tabla de precios por modelo** (input, output, escritura de caché, lectura de caché, por millón de tokens) incluida en Hydra con valores por defecto para los modelos actuales y **editable en las preferencias** (archivo de preferencias hasta que exista la pantalla de Config, feature 007). Los modelos sin precio conocido muestran "—" en costo y se listan en un aviso discreto ("N modelos sin precio: …"). Toda cifra en dinero lleva la marca "estimado".

### Datos

10. **FR-10 — Fuente:** **todos** los transcripts locales de Claude Code de la máquina (todas las carpetas de proyecto, todas las sesiones, incluidas las creadas fuera de Hydra y las de proyectos no registrados). Se leen **solo lectura**; Hydra nunca los modifica ni mueve. **FR-10b:** las sesiones cuya carpeta está bajo un directorio temporal del sistema (`/tmp`, `/private/tmp`, `/var/folders`, `/private/var/folders`) se **excluyen** de la vista y de todos los agregados (son pruebas, no trabajo).
11. **FR-11 — Qué se mide por sesión:** identificador, carpeta (→ proyecto), título, inicio y fin, cantidad de turnos de usuario y de mensajes del asistente, tokens de entrada / salida / creación de caché / lectura de caché **por modelo**, duración acumulada de turnos, herramientas invocadas (conteo por nombre; se guarda aunque no se muestre en esta versión, sirve para 006), rama git si está. Los sub-agentes que Claude Code guarda aparte se suman a su sesión padre.
12. **FR-12 — Índice incremental:** la primera apertura indexa todo con una **barra de progreso** (archivos procesados / total) y la vista se va poblando; las siguientes aperturas son **inmediatas** porque el resumen de cada transcript se conserva en un caché local y solo se re-procesan los archivos que cambiaron (y, si solo crecieron, solo la parte nueva). El caché se puede borrar desde la vista ("Reindexar") y se reconstruye solo si está corrupto o de una versión anterior.
13. **FR-13 — Al día:** mientras la vista está abierta, las sesiones que siguen escribiendo se reflejan en menos de **10 s** (sin parpadeos ni pérdida de la posición de scroll). Cerrar la vista libera la observación.
14. **FR-14 — Robustez:** líneas JSON rotas o parciales (un archivo que se está escribiendo), campos faltantes, formatos de versiones viejas del CLI o transcripts vacíos **no** rompen el índice: se saltan con conteo de "líneas ignoradas" visible en un detalle técnico. Un transcript ilegible se marca y se sigue con el resto.
15. **FR-15 — Rendimiento:** con ~100 MB de transcripts, la primera indexación termina en menos de **30 s** sin congelar la interfaz; con el caché caliente la vista aparece en menos de **1 s**; cambiar de rango/filtro responde en menos de **200 ms**.

### Diseño

16. **FR-16 — Look & feel:** la vista sigue el lenguaje visual de Hydra (fondo oscuro, acento verde) con un diseño **moderno y cuidado**: jerarquía tipográfica clara (números grandes, etiquetas discretas), tarjetas con profundidad sutil, gráficos limpios sin "chrome" innecesario, una paleta categórica por modelo/proyecto consistente en toda la vista, estados vacíos y de carga diseñados, y transiciones breves al cambiar de rango. Sin librerías de gráficos de terceros (gráficos propios), para que el estilo sea uniforme y el bundle no crezca.
17. **FR-17 — Estado vacío:** sin transcripts en la máquina o sin datos en el rango, la vista lo explica ("Todavía no hay sesiones en este rango") y sugiere ampliar el rango.

## Non-goals

- **Detalle por sesión** (desglose de turnos, herramientas, archivos tocados, diff). Va en una feature posterior o en 006.
- **Edición / borrado de transcripts** o de sesiones desde Analytics.
- **Exportar** (CSV, imagen). Quizá después.
- **Costo real facturado** ni integración con la cuenta de Anthropic: solo estimación local por tokens.
- **Métricas de calidad** (errores del modelo, rechazos, tests que fallaron).
- **Pantalla de configuración** para precios/rango: llega en 007; aquí solo se define la preferencia.
- **Sincronizar entre máquinas** o leer transcripts remotos.

## Edge cases

- **Transcript en escritura** (última línea incompleta): se ignora la línea incompleta y se retoma en la próxima pasada.
- **Sesión que cambió de carpeta** (`cwd` distinto entre mensajes): se asigna a la carpeta del primer mensaje.
- **Sesiones de `/resume --fork-session`** y ejecuciones `-p`: se cuentan como sesiones normales (son uso real).
- **Sub-agentes** (carpeta `subagents/` dentro de la sesión): sus tokens se suman a la sesión padre; no aparecen como sesiones propias.
- **Cambio de horario / zona horaria:** todo se agrupa en la zona local actual; el heatmap usa la hora local del momento del mensaje.
- **Modelos nuevos sin precio:** costo "—" y aviso; al agregar el precio en preferencias, se recalcula sin reindexar.
- **Carpeta de proyectos de Claude ausente** (Claude Code recién instalado): estado vacío sin error.
- **Muchísimas sesiones** (miles): la tabla se pagina o virtualiza; los agregados siguen siendo instantáneos.
- **Un proyecto registrado en Hydra cuya carpeta coincide parcialmente con otra** (prefijos): se usa el mismo matching que el sidebar (001), por ruta más específica.
- **Cambiar a Analytics con un pane expandido:** al volver a Sessions, el pane sigue expandido; el foco de teclado no va a ninguna terminal mientras Analytics está visible.

## Acceptance criteria

- **AC-1 (navegar):** Given la grilla con dos panes vivos, when pulso Analytics, then el área central muestra el dashboard; when pulso Sessions, then vuelve la grilla sin que ninguna terminal se re-adjunte ni pierda su contenido; when reinicio Hydra, then se conserva la última vista.
- **AC-2 (primer índice):** Given una máquina con transcripts (~80–100 MB), when abro Analytics por primera vez, then aparece la barra de progreso, la vista se puebla progresivamente y termina en < 30 s con la interfaz responsiva; when la cierro y la vuelvo a abrir, then aparece completa en < 1 s.
- **AC-3 (tarjetas y rango):** Given el rango "7 días", then las tarjetas muestran tokens, costo estimado, sesiones, turnos y tiempo trabajando del período, con la variación respecto de los 7 días anteriores; when cambio a "Hoy" o a un rango personalizado, then todo se recalcula en < 200 ms.
- **AC-4 (uso por día):** Given el rango "30 días", then el gráfico muestra 30 columnas (incluidos los días sin uso), apiladas por modelo, y el tooltip de un día da total y por modelo; when alterno a Costo, then las alturas cambian y la leyenda dice "estimado".
- **FR-5/AC-5 (cuándo trabajo):** Given sesiones a distintas horas, then el heatmap hora × día de la semana refleja la concentración en hora local; el tooltip de una celda muestra el valor.
- **AC-6 (proyectos y modelos):** Given sesiones en tres carpetas (dos registradas en Hydra), then las barras por proyecto muestran los nombres de Hydra para las registradas y la ruta abreviada para la otra, ordenadas por uso, y el desglose por modelo suma el total; when hago clic en una barra, then se aplica el filtro de proyecto a toda la vista.
- **AC-7 (tabla):** Given el rango "Todo", then la tabla lista todas las sesiones con título, proyecto, inicio, duración, turnos, tokens, costo, modelo y la marca "viva" en las activas; when ordeno por costo, then la más cara queda primera; when hago clic en una viva, then vuelvo a Sessions con ese pane enfocado.
- **AC-8 (costo):** Given precios por defecto, then el costo de una sesión coincide con la fórmula tokens × precio por tipo y modelo; when agrego en preferencias el precio de un modelo que figuraba "—", then su costo aparece sin reindexar.
- **AC-9 (al día):** Given Analytics abierto y una sesión viva trabajando, then en < 10 s la tabla y las tarjetas reflejan los tokens nuevos sin que la vista salte.
- **AC-10 (robustez):** Given un transcript con una línea rota y otro vacío, then el índice se completa, ambos casos se cuentan como ignorados en el detalle técnico y el resto se muestra.
- **AC-11 (look):** Given el dashboard con datos, then se percibe moderno y consistente con Hydra (revisión visual de Juan): tipografía jerárquica, tarjetas, paleta consistente, estados de carga/vacío diseñados, sin gráficos "de stock".

## Integration

- **Affected existing features:** 001 (sidebar: ítem Analytics; vista central alternativa; enfocar un pane desde la tabla), 002 (la solapa Sesiones/Archivos de la barra izquierda no cambia; Analytics es una vista del área central).
- **Shared interfaces touched:** contrato entre procesos (nueva operación de indexar/consultar analíticas con progreso; preferencia de precios); preferencias de UI (vista activa, rango); matching carpeta→proyecto de 001 reutilizado.
- **Breaking changes:** ninguna.
- **Constitution:** la Constitution ya prevé "leer los transcripts `.jsonl` de `~/.claude/projects/` para analíticas". El caché del índice es un archivo JSON en el directorio de datos de la app (no una base de datos), acorde a "persistencia local: archivos JSON".
- **Para 006 (Graph Know):** el lector de transcripts y el índice por sesión (con herramientas y, a futuro, archivos tocados) son la base que 006 reutiliza.

## Open questions

- [x] Propósito: uso/gasto + en qué proyectos y cuándo (Juan, 2026-08-23).
- [x] Alcance: todo `~/.claude/projects` (Juan).
- [x] Costo: tokens + costo estimado con precios editables (Juan).
- [x] Ubicación: reemplaza el área central (Juan).
- [x] Profundidad: dashboard + tabla de sesiones; sin detalle por sesión (Juan).
- [x] Look: moderno y cuidado, gráficos propios (Juan: "canchero y moderno").
- [x] **Proyectos temporales** (rutas bajo `/tmp`, `/private/tmp`, `/var/folders`): **no se muestran** ni cuentan en ningún agregado (Juan, 2026-08-23). Queda como regla FR-10b.
