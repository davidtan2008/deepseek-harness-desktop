export type ChangeSource = 'agent' | 'user' | 'formatter' | 'git-external' | 'unknown'
export type ProjectedChangeStatus = 'agent' | 'user' | 'external' | 'conflict' | 'reverted'

export interface FileObservation {
  path: string
  beforeHash: string | null
  afterHash: string | null
  source: ChangeSource
  turnId?: string
  observedAt: string
}

export interface ProjectedChange {
  path: string
  beforeHash: string | null
  afterHash: string | null
  source: ChangeSource | 'mixed'
  turnIds: string[]
  status: ProjectedChangeStatus
  conflict: boolean
  reloadSuggested: boolean
  observationCount: number
}

export interface ChangeProjection {
  changes: ProjectedChange[]
  conflicts: ProjectedChange[]
}

function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..')
}

/** Project ordered file observations without mutating files or choosing a winner. */
export function projectChanges(observations: readonly FileObservation[]): ChangeProjection {
  const byPath = new Map<string, FileObservation[]>()
  for (const observation of observations) {
    if (!safePath(observation.path)) throw new Error(`unsafe projected path: ${observation.path}`)
    const entries = byPath.get(observation.path) ?? []
    entries.push(observation)
    byPath.set(observation.path, entries)
  }

  const changes = [...byPath.entries()].map(([path, entries]) => {
    const sources = new Set(entries.map((entry) => entry.source))
    const turnIds = [...new Set(entries.flatMap((entry) => entry.turnId === undefined ? [] : [entry.turnId]))]
    const beforeHash = entries[0]?.beforeHash ?? null
    const afterHash = entries.at(-1)?.afterHash ?? null
    let chainConflict = false
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index - 1]?.afterHash !== entries[index]?.beforeHash) chainConflict = true
    }
    const mixedSources = sources.size > 1
    const hasAgent = sources.has('agent')
    const hasNonAgent = [...sources].some((source) => source !== 'agent')
    const conflict = chainConflict || (hasAgent && hasNonAgent)
    const reverted = !conflict && beforeHash === afterHash
    const source: ChangeSource | 'mixed' = mixedSources ? 'mixed' : entries[0]?.source ?? 'unknown'
    const status: ProjectedChangeStatus = conflict
      ? 'conflict'
      : reverted
        ? 'reverted'
        : source === 'agent'
          ? 'agent'
          : source === 'user'
            ? 'user'
            : 'external'
    return {
      path,
      beforeHash,
      afterHash,
      source,
      turnIds,
      status,
      conflict,
      reloadSuggested: conflict && hasAgent,
      observationCount: entries.length,
    }
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)

  return { changes, conflicts: changes.filter((change) => change.conflict) }
}
