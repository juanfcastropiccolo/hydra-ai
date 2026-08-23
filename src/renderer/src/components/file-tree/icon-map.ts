// Pure mapping: file/folder name → { glyph, color }. Own minimal "editor-like" icon set (spec 002).
export interface IconSpec {
  /** Short glyph rendered inside the badge (1–3 chars) or a folder marker. */
  glyph: string
  color: string
  /** Folder variants. */
  folder?:
    'generic' | 'src' | 'test' | 'docs' | 'node_modules' | 'config' | 'git' | 'build' | 'assets'
}

const FOLDER_COLORS: Record<NonNullable<IconSpec['folder']>, string> = {
  generic: '#dcb67a',
  src: '#4fc1ff',
  test: '#c586c0',
  docs: '#6cb6ff',
  node_modules: '#8bc34a',
  config: '#9e9e9e',
  git: '#f14e32',
  build: '#ffa726',
  assets: '#f48fb1'
}

const FOLDER_KINDS: Array<[RegExp, NonNullable<IconSpec['folder']>]> = [
  [/^(src|lib|app|source|packages)$/i, 'src'],
  [/^(test|tests|__tests__|spec|specs|e2e|cypress|playwright)$/i, 'test'],
  [/^(docs?|documentation|wiki)$/i, 'docs'],
  [/^node_modules$/, 'node_modules'],
  [/^(\.sdd|\.claude|\.github|\.vscode|\.idea|config|configs|\.config)$/i, 'config'],
  [/^\.git$/, 'git'],
  [/^(dist|build|out|release|target|coverage|\.next|\.turbo)$/i, 'build'],
  [/^(assets|public|static|images|img|resources|media|fonts)$/i, 'assets']
]

const BY_NAME: Record<string, IconSpec> = {
  'package.json': { glyph: 'npm', color: '#cb3837' },
  'package-lock.json': { glyph: 'npm', color: '#cb3837' },
  'pnpm-lock.yaml': { glyph: 'pnpm', color: '#f9ad00' },
  'yarn.lock': { glyph: 'yarn', color: '#2c8ebb' },
  'tsconfig.json': { glyph: 'TS', color: '#3178c6' },
  '.gitignore': { glyph: 'git', color: '#f14e32' },
  '.gitattributes': { glyph: 'git', color: '#f14e32' },
  '.nvmrc': { glyph: 'node', color: '#8bc34a' },
  '.editorconfig': { glyph: 'ec', color: '#9e9e9e' },
  '.prettierrc': { glyph: 'pr', color: '#56b3b4' },
  '.prettierrc.yaml': { glyph: 'pr', color: '#56b3b4' },
  '.prettierignore': { glyph: 'pr', color: '#56b3b4' },
  '.eslintcache': { glyph: 'es', color: '#4b32c3' },
  'eslint.config.mjs': { glyph: 'es', color: '#4b32c3' },
  'vitest.config.ts': { glyph: 'vi', color: '#6e9f18' },
  'playwright.config.ts': { glyph: 'pw', color: '#2ead33' },
  'electron-builder.yml': { glyph: 'eb', color: '#47848f' },
  'electron.vite.config.ts': { glyph: 'ev', color: '#47848f' },
  dockerfile: { glyph: 'dk', color: '#2496ed' },
  makefile: { glyph: 'mk', color: '#9e9e9e' },
  license: { glyph: '§', color: '#d4af37' },
  'claude.md': { glyph: 'AI', color: '#d97757' }
}

const BY_EXT: Record<string, IconSpec> = {
  ts: { glyph: 'TS', color: '#3178c6' },
  tsx: { glyph: 'TSX', color: '#3178c6' },
  mts: { glyph: 'TS', color: '#3178c6' },
  cts: { glyph: 'TS', color: '#3178c6' },
  js: { glyph: 'JS', color: '#f7df1e' },
  jsx: { glyph: 'JSX', color: '#61dafb' },
  mjs: { glyph: 'JS', color: '#f7df1e' },
  cjs: { glyph: 'JS', color: '#f7df1e' },
  json: { glyph: '{}', color: '#cbcb41' },
  jsonl: { glyph: '{}', color: '#cbcb41' },
  md: { glyph: 'MD', color: '#519aba' },
  mdx: { glyph: 'MDX', color: '#519aba' },
  css: { glyph: '#', color: '#563d7c' },
  scss: { glyph: '#', color: '#c6538c' },
  html: { glyph: '<>', color: '#e34c26' },
  yml: { glyph: 'Y', color: '#cb171e' },
  yaml: { glyph: 'Y', color: '#cb171e' },
  toml: { glyph: 'T', color: '#9c4121' },
  sh: { glyph: '$', color: '#89e051' },
  zsh: { glyph: '$', color: '#89e051' },
  bash: { glyph: '$', color: '#89e051' },
  py: { glyph: 'PY', color: '#3572a5' },
  rs: { glyph: 'RS', color: '#dea584' },
  go: { glyph: 'GO', color: '#00add8' },
  rb: { glyph: 'RB', color: '#701516' },
  java: { glyph: 'J', color: '#b07219' },
  swift: { glyph: 'SW', color: '#f05138' },
  c: { glyph: 'C', color: '#555555' },
  h: { glyph: 'H', color: '#555555' },
  cpp: { glyph: 'C+', color: '#f34b7d' },
  sql: { glyph: 'SQL', color: '#e38c00' },
  png: { glyph: '▣', color: '#a074c4' },
  jpg: { glyph: '▣', color: '#a074c4' },
  jpeg: { glyph: '▣', color: '#a074c4' },
  gif: { glyph: '▣', color: '#a074c4' },
  svg: { glyph: 'SVG', color: '#ffb13b' },
  ico: { glyph: '▣', color: '#a074c4' },
  icns: { glyph: '▣', color: '#a074c4' },
  pdf: { glyph: 'PDF', color: '#b30b00' },
  txt: { glyph: '≡', color: '#9e9e9e' },
  log: { glyph: '≡', color: '#9e9e9e' },
  lock: { glyph: '🔒', color: '#9e9e9e' },
  env: { glyph: 'env', color: '#ecd53f' },
  zip: { glyph: 'zip', color: '#9e9e9e' },
  dmg: { glyph: 'dmg', color: '#9e9e9e' },
  plist: { glyph: 'pl', color: '#9e9e9e' },
  bin: { glyph: '01', color: '#9e9e9e' }
}

const GENERIC: IconSpec = { glyph: '·', color: '#9e9e9e' }

export function iconFor(
  name: string,
  kind: 'dir' | 'file' | 'symlink' | 'other',
  opts: { open?: boolean; symlinkKind?: 'dir' | 'file' } = {}
): IconSpec {
  const isDir = kind === 'dir' || (kind === 'symlink' && opts.symlinkKind === 'dir')
  if (isDir) {
    const variant = FOLDER_KINDS.find(([re]) => re.test(name))?.[1] ?? 'generic'
    return { glyph: opts.open ? '▾' : '▸', color: FOLDER_COLORS[variant], folder: variant }
  }
  const lower = name.toLowerCase()
  if (BY_NAME[lower]) return BY_NAME[lower]!
  if (lower.startsWith('.env')) return BY_EXT['env']!
  if (lower.startsWith('readme')) return { glyph: 'MD', color: '#519aba' }
  if (lower.startsWith('dockerfile')) return BY_NAME['dockerfile']!
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot + 1) : ''
  if (lower.endsWith('.test.ts') || lower.endsWith('.spec.ts'))
    return { glyph: 'TS✓', color: '#c586c0' }
  if (lower.endsWith('.d.ts')) return { glyph: 'd.ts', color: '#3178c6' }
  return BY_EXT[ext] ?? GENERIC
}
