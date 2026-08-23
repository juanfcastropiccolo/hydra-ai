// Feature 006 FR-3: the fixed prompt that turns a session transcript into a knowledge card (JSON).
export const CARD_MAX_FACTS = 15

export function buildCardPrompt(existingFacts: Array<{ id: string; text: string }>): string {
  const existing = existingFacts.length
    ? [
        '',
        'Hechos vigentes registrados de este proyecto (id: texto). Si esta conversación deja alguno obsoleto o lo contradice, incluí su id en "superseded_ids":',
        ...existingFacts.map((f) => `- ${f.id}: ${f.text}`)
      ].join('\n')
    : ''
  return [
    'Analizá esta conversación y devolvé SOLO un objeto JSON (sin markdown, sin texto alrededor) con este esquema exacto:',
    '{"summary": string, "facts": [{"text": string, "kind": "decision"|"dato"|"estado"|"pendiente", "entities": string[]}], "superseded_ids": string[]}',
    '',
    'Reglas:',
    `- "facts": entre 3 y ${CARD_MAX_FACTS} hechos atómicos y autocontenidos, en el idioma predominante de la conversación: decisiones (con su porqué), datos y nombres clave, estado del trabajo, pendientes. Nada genérico.`,
    '- "entities": rutas de archivo relevantes tal como aparecen y temas cortos en minúsculas (1-3 palabras). 1 a 5 por hecho.',
    '- "summary": 1-2 oraciones sobre qué se hizo y en qué quedó.',
    '- No uses herramientas ni leas archivos. Si la conversación no tiene contenido técnico, devolvé "facts": [] y un summary honesto.',
    existing
  ].join('\n')
}
