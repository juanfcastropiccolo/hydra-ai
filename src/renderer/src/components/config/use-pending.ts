// Feature 007 FR-3: draft state for text/number fields — dirty tracking, save, discard.
// The draft is derived (`current` + local edits) so outside changes flow in while nothing is dirty.
import { useCallback, useMemo, useState } from 'react'

export interface Pending<T extends object> {
  draft: T
  dirty: boolean
  set<K extends keyof T>(key: K, value: T[K]): void
  save(): Promise<void>
  discard(): void
  saving: boolean
  error: string | null
}

export function usePending<T extends object>(
  current: T,
  onSave: (patch: Partial<T>) => Promise<void>
): Pending<T> {
  const [edits, setEdits] = useState<Partial<T>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft = useMemo(() => ({ ...current, ...edits }), [current, edits])
  const dirty = useMemo(
    () => (Object.keys(edits) as Array<keyof T>).some((k) => edits[k] !== current[k]),
    [edits, current]
  )
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setEdits((e) => ({ ...e, [key]: value }))
    setError(null)
  }, [])
  const discard = useCallback(() => {
    setEdits({})
    setError(null)
  }, [])
  const save = useCallback(async () => {
    const patch: Partial<T> = {}
    for (const k of Object.keys(edits) as Array<keyof T>)
      if (edits[k] !== current[k]) patch[k] = edits[k]
    if (Object.keys(patch).length === 0) {
      setEdits({})
      return
    }
    setSaving(true)
    try {
      await onSave(patch)
      setEdits({})
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [edits, current, onSave])
  return { draft, dirty, set, save, discard, saving, error }
}
