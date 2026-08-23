import { describe, expect, it } from 'vitest'
import { createImportContextStore } from './import-context-slice'

const src = { importId: 'i1', sourceSessionId: 'A', sourceName: 'a' }

describe('import-context store', () => {
  it('dialog open/close; startImport closes the dialog for that target', () => {
    const st = createImportContextStore()
    st.getState().openDialog('B')
    expect(st.getState().dialogTargetId).toBe('B')
    expect(st.getState().startImport('B', src)).toBe(true)
    expect(st.getState().dialogTargetId).toBeNull()
    expect(st.getState().get('B')).toMatchObject({ ...src, phase: 'running' })
  })

  it('allows one running import per target; other targets are independent', () => {
    const st = createImportContextStore()
    expect(st.getState().startImport('B', src)).toBe(true)
    expect(st.getState().startImport('B', { ...src, importId: 'i2' })).toBe(false)
    expect(st.getState().get('B')?.importId).toBe('i1')
    expect(st.getState().startImport('C', src)).toBe(true)
  })

  it('running → ready → done; stale results (other importId / not running) are ignored', () => {
    const st = createImportContextStore()
    st.getState().startImport('B', src)
    st.getState().markReady('B', 'old', { text: 'x', truncated: false, model: 'haiku' })
    expect(st.getState().get('B')?.phase).toBe('running')
    st.getState().markReady('B', 'i1', { text: 'bloque', truncated: true, model: 'haiku' })
    expect(st.getState().get('B')).toMatchObject({
      phase: 'ready',
      text: 'bloque',
      truncated: true
    })
    st.getState().markError('B', 'i1', 'late error') // not running any more → ignored
    expect(st.getState().get('B')?.phase).toBe('ready')
    st.getState().markDone('B')
    expect(st.getState().get('B')?.phase).toBe('done')
  })

  it('ready → blocked → retryPaste → ready; done → retryPaste → ready; running cannot retry', () => {
    const st = createImportContextStore()
    st.getState().startImport('B', src)
    st.getState().retryPaste('B')
    expect(st.getState().get('B')?.phase).toBe('running')
    st.getState().markReady('B', 'i1', { text: 't', truncated: false, model: 'haiku' })
    st.getState().markBlocked('B')
    expect(st.getState().get('B')?.phase).toBe('blocked')
    st.getState().retryPaste('B')
    expect(st.getState().get('B')?.phase).toBe('ready')
    st.getState().markDone('B')
    st.getState().retryPaste('B')
    expect(st.getState().get('B')?.phase).toBe('ready')
  })

  it('error keeps the source so the user can retry; clear forgets everything', () => {
    const st = createImportContextStore()
    st.getState().startImport('B', src)
    st.getState().markError('B', 'i1', 'boom')
    expect(st.getState().get('B')).toMatchObject({
      phase: 'error',
      error: 'boom',
      sourceSessionId: 'A'
    })
    expect(st.getState().startImport('B', { ...src, importId: 'i2' })).toBe(true) // retry allowed
    st.getState().clear('B')
    expect(st.getState().get('B')).toBeUndefined()
    const before = st.getState().byTarget
    st.getState().clear('B')
    expect(st.getState().byTarget).toBe(before) // no-op keeps the reference stable
  })
})
