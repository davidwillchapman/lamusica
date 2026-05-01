import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import type { RawLibrary } from '../parser/types'
import type { SchemaWarnings } from '../sync/schemaValidator'

interface UnknownKeyEntry {
  key: string
  inferredType: string
  suggestedColumn: string
  suggestedMigration: string
  affectedPersistentIds: string[]
  sampleValues: unknown[]
}

interface PatchFile {
  syncRunId: number
  generatedAt: string
  unknownTrackKeys: UnknownKeyEntry[]
  unknownPlaylistKeys: UnknownKeyEntry[]
  reprocessInstructions: string
}

function toSnakeCase(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function inferType(values: unknown[]): string {
  const sample = values.find((v) => v !== null && v !== undefined)
  if (sample === undefined) return 'text'
  if (typeof sample === 'boolean') return 'boolean'
  if (typeof sample === 'number') return Number.isInteger(sample) ? 'integer' : 'real'
  if (sample instanceof Date) return 'datetime'
  return 'text'
}

function sqlType(inferred: string): string {
  switch (inferred) {
    case 'boolean': return 'BOOLEAN'
    case 'integer': return 'INTEGER'
    case 'real': return 'REAL'
    case 'datetime': return 'DATETIME'
    default: return 'TEXT'
  }
}

export async function generatePatch(
  syncRunId: number,
  warnings: SchemaWarnings,
  library: RawLibrary,
): Promise<string> {
  const generatedAt = dayjs().toISOString()

  function buildEntries(
    keys: string[],
    affectedIds: Record<string, string[]>,
    table: 'tracks' | 'playlists',
    getValues: (key: string) => unknown[],
  ): UnknownKeyEntry[] {
    return keys.map((key) => {
      const values = getValues(key)
      const inferred = inferType(values)
      const col = toSnakeCase(key)
      return {
        key,
        inferredType: inferred,
        suggestedColumn: col,
        suggestedMigration: `ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType(inferred)};`,
        affectedPersistentIds: affectedIds[key] ?? [],
        sampleValues: values.slice(0, 5),
      }
    })
  }

  const trackEntries = buildEntries(
    warnings.unknownTrackKeys,
    warnings.affectedTrackIds,
    'tracks',
    (key) =>
      Object.values(library.Tracks)
        .filter((t) => t[key] !== undefined)
        .slice(0, 10)
        .map((t) => t[key]),
  )

  const playlistEntries = buildEntries(
    warnings.unknownPlaylistKeys,
    warnings.affectedPlaylistIds,
    'playlists',
    (key) =>
      library.Playlists.filter((p) => p[key] !== undefined)
        .slice(0, 10)
        .map((p) => p[key]),
  )

  const patchFile: PatchFile = {
    syncRunId,
    generatedAt,
    unknownTrackKeys: trackEntries,
    unknownPlaylistKeys: playlistEntries,
    reprocessInstructions: `After applying the suggested migration, re-run the sync with: npm run sync -- --file <source_file> --patch-run ${syncRunId}`,
  }

  const patchDir = path.resolve('patches')
  fs.mkdirSync(patchDir, { recursive: true })
  const patchPath = path.join(patchDir, `${syncRunId}-patch.json`)
  fs.writeFileSync(patchPath, JSON.stringify(patchFile, null, 2), 'utf-8')

  return `patches/${syncRunId}-patch.json`
}
