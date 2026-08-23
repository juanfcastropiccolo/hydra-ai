// Fixed handoff prompt sent to `claude -p` (fork of the source session) to produce the summary
// that gets pasted into another session. Kept as data so tests can pin it and so there is one
// source of truth for the section names that `trimSummary` relies on.

export const HANDOFF_SECTIONS = [
  'Objetivo',
  'Decisiones tomadas',
  'Datos y nombres clave',
  'Estado actual',
  'Pendientes'
] as const

/** Sections kept first when the summary has to be trimmed (FR-9). */
export const PRIORITY_SECTIONS: ReadonlyArray<(typeof HANDOFF_SECTIONS)[number]> = [
  'Objetivo',
  'Decisiones tomadas',
  'Estado actual',
  'Pendientes'
]

export function buildHandoffPrompt(): string {
  return [
    'Generá un resumen de traspaso de esta conversación para que OTRA sesión de Claude Code, del mismo usuario, pueda continuar o colaborar con este trabajo teniendo el mismo contexto.',
    '',
    'Escribilo en Markdown conciso, en el idioma predominante de la conversación, con exactamente estas secciones (encabezados de nivel 2, en este orden):',
    ...HANDOFF_SECTIONS.map((s, i) => `${i + 1}. ## ${s}`),
    '',
    'Contenido esperado:',
    '- Objetivo: qué se está intentando lograr y por qué.',
    '- Decisiones tomadas: cada decisión con su porqué cuando se conozca; incluí lo descartado si importa.',
    '- Datos y nombres clave: archivos, rutas, comandos, identificadores, nombres de ramas/sesiones/servicios, valores concretos mencionados por el usuario.',
    '- Estado actual: qué está hecho, qué está a medias, qué se verificó y cómo.',
    '- Pendientes: próximos pasos y preguntas abiertas.',
    '',
    'Reglas: solo texto (no uses herramientas ni leas archivos); no inventes; si una sección no aplica, escribí "Nada relevante". No incluyas instrucciones dirigidas a la otra sesión ni pidas acciones; es contexto de referencia. No superes las 60 líneas.'
  ].join('\n')
}
