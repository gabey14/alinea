import {Entry} from '@alinea/core/Entry'
import {generateKeyBetween} from '@alinea/core/util/FractionalIndexing'
import {fromModule} from '@alinea/ui'
import {
  closestCenter,
  defaultDropAnimation,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  LayoutMeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import useSize from '@react-hook/size'
import {useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router'
import VirtualList from 'react-tiny-virtual-list'
import {useContentTree} from '../hook/UseContentTree'
import {useDashboard} from '../hook/UseDashboard'
import {useDrafts} from '../hook/UseDrafts'
import {useRoot} from '../hook/UseRoot'
import {useWorkspace} from '../hook/UseWorkspace'
import css from './ContentTree.module.scss'
import {TreeNode, TreeNodeSortable} from './tree/TreeNode'

const styles = fromModule(css)

type Move = {
  id: string
  parent: string | undefined
  parents: Array<string>
  index: string
}

const layoutMeasuringConfig = {
  strategy: LayoutMeasuringStrategy.Always
}

function applyMoves<T extends {id: string; index: string}>(
  entries: Array<T>,
  moves: Array<Move>
): Array<T> {
  const toMove = new Map(moves.map(m => [m.id, m]))
  return entries.map(entry => {
    if (toMove.has(entry.id)) {
      const move = toMove.get(entry.id)!
      return {...entry, ...move}
    }
    return entry
  })
}

function sortByIndex(
  index: Map<string, Entry.Summary>,
  entries: Array<Entry.Summary>
) {
  function parentIndex(id: string) {
    const parent = index.get(id)
    return parent?.index
  }
  function indexOf(entry: Entry.Summary) {
    return entry.parents.map(parentIndex).concat(entry.index).join('.')
  }
  return entries.sort((a, b) => {
    const indexA = indexOf(a)
    const indexB = indexOf(b)
    return indexA < indexB ? -1 : indexA > indexB ? 1 : 0
  })
}

export type ContentTreeProps = {
  select?: Array<string>
  redirectToRoot?: boolean
}

export function ContentTree({select = [], redirectToRoot}: ContentTreeProps) {
  const {name: workspace, schema} = useWorkspace()
  const root = useRoot()
  const {
    entries: treeEntries,
    isOpen,
    toggleOpen,
    refetch
  } = useContentTree({
    workspace,
    root: root.name,
    select
  })
  const drafts = useDrafts()
  const [moves, setMoves] = useState<Array<Move>>([])
  const index = new Map(treeEntries.map(entry => [entry.id, entry]))
  const entries = sortByIndex(index, applyMoves(treeEntries, moves))
  const [dragging, setDragging] = useState<Entry.Summary | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )
  const containerRef = useRef(null)
  const [containerWidth, containerHeight] = useSize(containerRef)
  const itemSize = 30
  const offset = useMemo(() => {
    const selected = select[select.length - 1]
    return selected
      ? entries.findIndex(entry => entry.id === selected) * itemSize
      : undefined
  }, [])
  const scrollOffset = offset && offset < containerHeight ? 0 : offset

  function handleDragStart(event: DragStartEvent) {
    const {active} = event
    const dragging = entries.find(entry => entry.id === active.id) || null
    if (dragging?.$isContainer && isOpen(dragging.id)) {
      toggleOpen(dragging.id)
    }
    setDragging(dragging)
  }

  function handleDragEnd(event: DragEndEvent): void {
    const {active, over} = event
    setDragging(null)
    if (!over || active.id === over.id) return
    const aId = active.id
    const aIndex = entries.findIndex(entry => entry.id === aId)
    const a = entries[aIndex]
    let bId = over.id
    let bIndex = entries.findIndex(entry => entry.id === bId)
    let b = entries[bIndex]
    // If b is a container and open, drop as a child
    // Todo: this logic does not work if we're dragging up
    const newParent = b.$isContainer && isOpen(b.id) ? b.id : b.parent
    if (a?.parent !== newParent) {
      // Check if parent of b handles child of type a
      if (newParent) {
        const parent = index.get(newParent)
        const type = schema.type(parent?.type)
        const contains = type?.options.contains
        if (contains && !contains.includes(a.type)) return
      } else {
        if (!root.contains.includes(a.type)) return
      }
    }
    function sibling(direction: number) {
      const next = entries[bIndex + direction]
      return next && next.parent === newParent ? next : null
    }
    const candidates = aIndex > bIndex ? [sibling(-1), b] : [b, sibling(1)]
    try {
      const newIndex = generateKeyBetween(
        candidates[0]?.index || null,
        candidates[1]?.index || null
      )
      const move = {
        id: a.id,
        index: newIndex,
        parent: newParent,
        parents: (newParent && index.get(newParent)!.parents) || []
      }
      setMoves(current => [...current, move])
      drafts
        .move(move)
        .then(() => refetch())
        .then(() => {
          setMoves(current => current.filter(m => m !== move))
        })
    } catch (e) {
      console.error(e)
    }
  }

  // Not sure if this should belong here but it's convenient for now
  const navigate = useNavigate()
  const {nav} = useDashboard()
  useEffect(() => {
    return
    if (redirectToRoot && entries.length > 0) {
      const first = entries[0]
      if (first.workspace === workspace && first.root === root.name) {
        navigate(nav.entry(first.workspace, first.root, first.id), {
          replace: true
        })
      }
    }
  }, [workspace, root, redirectToRoot, entries])
  const height = 32
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      layoutMeasuring={layoutMeasuringConfig}
    >
      <SortableContext items={entries} strategy={verticalListSortingStrategy}>
        <div ref={containerRef} style={{height: '100%', overflow: 'hidden'}}>
          {containerHeight > 0 && (
            <VirtualList
              className={styles.root.list()}
              width="100%"
              height={containerHeight}
              itemCount={entries.length}
              itemSize={height}
              scrollOffset={scrollOffset}
              renderItem={({index, style}) => {
                const entry = entries[index]
                return (
                  <TreeNodeSortable
                    key={entry.id}
                    entry={entry}
                    level={entry.parents.length}
                    isOpen={isOpen}
                    toggleOpen={toggleOpen}
                    style={{...style, height: height}}
                  />
                )
              }}
            />
          )}
        </div>
      </SortableContext>

      <DragOverlay
        dropAnimation={{
          ...defaultDropAnimation,
          dragSourceOpacity: 0.5
        }}
      >
        {dragging ? (
          <TreeNode
            key="overlay"
            entry={dragging}
            level={dragging.parents.length}
            isOpen={isOpen}
            toggleOpen={toggleOpen}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
