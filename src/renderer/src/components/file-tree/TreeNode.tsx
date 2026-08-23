import type { GitStatus } from '@shared/types'
import { FileIcon } from './FileIcon'
import styles from './TreeNode.module.css'
import type { TreeRow } from './tree-rows'

const BADGE: Record<GitStatus, string> = {
  untracked: 'U',
  added: 'A',
  modified: 'M',
  renamed: 'R',
  deleted: 'D',
  conflict: '!',
  ignored: ''
}
const DOT_COLOR: Record<GitStatus, string> = {
  untracked: '#73c991',
  added: '#73c991',
  modified: '#e2c08d',
  renamed: '#73c991',
  deleted: '#f14c4c',
  conflict: '#c74e39',
  ignored: 'transparent'
}

export interface TreeNodeProps {
  row: TreeRow
  status: GitStatus | null
  selected: boolean
  highlighted: boolean
  loading: boolean
  onToggle: (row: TreeRow) => void
  onSelect: (row: TreeRow) => void
  onOpen: (row: TreeRow) => void
  onContextMenu: (row: TreeRow, e: React.MouseEvent) => void
  onDragStart: (row: TreeRow, e: React.DragEvent) => void
}

export function TreeNode(p: TreeNodeProps): React.JSX.Element {
  const { row, status } = p
  const cls = [
    styles.row,
    p.selected ? styles.selected : '',
    p.highlighted ? styles.highlight : '',
    status === 'ignored' ? styles.ignored : status ? styles[status] : ''
  ].join(' ')
  return (
    <div
      className={cls}
      style={{ paddingLeft: 6 + row.depth * 14 }}
      data-testid="tree-row"
      data-path={row.path}
      data-rel={row.rel}
      data-kind={row.isDir ? 'dir' : 'file'}
      data-status={status ?? ''}
      data-selected={p.selected}
      title={row.rel}
      draggable
      onDragStart={(e) => p.onDragStart(row, e)}
      onClick={(e) => {
        p.onSelect(row)
        if (row.isDir && (e.target as HTMLElement).dataset['caret'] !== undefined) p.onToggle(row)
      }}
      onDoubleClick={() => (row.isDir ? p.onToggle(row) : p.onOpen(row))}
      onContextMenu={(e) => p.onContextMenu(row, e)}
    >
      <span
        className={styles.caret}
        data-caret
        onClick={(e) => {
          e.stopPropagation()
          if (row.isDir) p.onToggle(row)
        }}
      >
        {row.isDir ? (row.expanded ? '▾' : '▸') : ''}
      </span>
      <FileIcon
        name={row.name}
        kind={row.entry.kind}
        open={row.expanded}
        symlinkKind={row.entry.symlinkKind}
      />
      <span className={styles.name}>{row.name}</span>
      {row.entry.kind === 'symlink' && <span className={styles.symlink}>↗</span>}
      {p.loading && <span className={styles.loading}>…</span>}
      {status && status !== 'ignored' && !row.isDir && (
        <span className={styles.badge}>{BADGE[status]}</span>
      )}
      {status && status !== 'ignored' && row.isDir && (
        <span className={styles.dot} style={{ background: DOT_COLOR[status] }} />
      )}
    </div>
  )
}
