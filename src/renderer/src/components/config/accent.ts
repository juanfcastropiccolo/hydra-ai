// Feature 007 FR-6: accent color → CSS custom properties applied on :root (UI only; charts keep
// their validated palette).
import { PROJECT_COLORS, type ProjectColor } from '@shared/types'

/** [accent, dim] per color; dim is used for filled buttons/active chips. */
export const ACCENT_VARS: Record<ProjectColor, { accent: string; dim: string }> = {
  green: { accent: PROJECT_COLORS.green, dim: '#2f8f57' },
  blue: { accent: PROJECT_COLORS.blue, dim: '#2560a8' },
  violet: { accent: PROJECT_COLORS.violet, dim: '#5f55b3' },
  orange: { accent: PROJECT_COLORS.orange, dim: '#9c3f1a' },
  magenta: { accent: PROJECT_COLORS.magenta, dim: '#9a3a5e' },
  yellow: { accent: PROJECT_COLORS.yellow, dim: '#8a5c00' },
  aqua: { accent: PROJECT_COLORS.aqua, dim: '#12704f' },
  red: { accent: PROJECT_COLORS.red, dim: '#a84747' }
}

export function applyAccent(
  color: ProjectColor,
  root: { style: { setProperty(k: string, v: string): void } }
): void {
  const v = ACCENT_VARS[color] ?? ACCENT_VARS.green
  root.style.setProperty('--accent', v.accent)
  root.style.setProperty('--accent-dim', v.dim)
}
