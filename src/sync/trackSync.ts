import crypto from 'crypto'
import dayjs from 'dayjs'
import type { Knex } from 'knex'
import type { RawTrack } from '../parser/types'
import type { AddedTrackInfo, SyncCounts, TrackRow, UpdatedTrackInfo } from '../types'

const COLUMN_MAP: Record<string, keyof TrackRow> = {
  'Track ID': 'track_id',
  'Persistent ID': 'persistent_id',
  'Name': 'name',
  'Artist': 'artist',
  'Album Artist': 'album_artist',
  'Album': 'album',
  'Composer': 'composer',
  'Genre': 'genre',
  'Grouping': 'grouping',
  'Work': 'work',
  'Movement Name': 'movement_name',
  'Movement Number': 'movement_number',
  'Movement Count': 'movement_count',
  'Kind': 'kind',
  'Track Type': 'track_type',
  'Location': 'location',
  'Year': 'year',
  'Track Number': 'track_number',
  'Track Count': 'track_count',
  'Disc Number': 'disc_number',
  'Disc Count': 'disc_count',
  'Total Time': 'total_time',
  'Bit Rate': 'bit_rate',
  'Sample Rate': 'sample_rate',
  'Size': 'size',
  'Play Count': 'play_count',
  'Skip Count': 'skip_count',
  'Normalization': 'normalization',
  'Artwork Count': 'artwork_count',
  'File Folder Count': 'file_folder_count',
  'Library Folder Count': 'library_folder_count',
  'Play Date': 'play_date',
  'Play Date UTC': 'play_date_utc',
  'Skip Date': 'skip_date',
  'Release Date': 'release_date',
  'Date Added': 'date_added',
  'Date Modified': 'date_modified',
  'Sort Name': 'sort_name',
  'Sort Artist': 'sort_artist',
  'Sort Album Artist': 'sort_album_artist',
  'Sort Album': 'sort_album',
  'Sort Composer': 'sort_composer',
  'Loved': 'loved',
  'Disliked': 'disliked',
  'Favorited': 'favorited',
  'Clean': 'clean',
  'Explicit': 'explicit',
  'Compilation': 'compilation',
  'Purchased': 'purchased',
  'Apple Music': 'apple_music',
  'Has Video': 'has_video',
  'HD': 'hd',
  'Music Video': 'music_video',
  'Playlist Only': 'playlist_only',
  'Part Of Gapless Album': 'part_of_gapless_album',
}

const DATE_COLUMNS = new Set<keyof TrackRow>([
  'play_date_utc', 'skip_date', 'release_date', 'date_added', 'date_modified',
])

function serializeValue(col: keyof TrackRow, value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (DATE_COLUMNS.has(col) && value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

function buildRow(raw: RawTrack, now: string): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [plistKey, col] of Object.entries(COLUMN_MAP)) {
    const value = raw[plistKey]
    row[col] = serializeValue(col, value)
  }
  // Build content hash over all mapped fields (excluding id, timestamps, hash itself)
  const hashInput = JSON.stringify(
    Object.keys(COLUMN_MAP)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = row[COLUMN_MAP[k]]
        return acc
      }, {}),
  )
  row.content_hash = crypto.createHash('sha1').update(hashInput).digest('hex')
  row.updated_at = now
  return row
}

export interface TrackSyncResult extends SyncCounts {
  addedItems: AddedTrackInfo[]
  updatedItems: UpdatedTrackInfo[]
}

export async function syncTracks(
  db: Knex,
  rawTracks: Record<string, RawTrack>,
): Promise<TrackSyncResult> {
  const now = dayjs().toISOString()
  const result: TrackSyncResult = {
    added: 0,
    updated: 0,
    unchanged: 0,
    addedItems: [],
    updatedItems: [],
  }

  // Load existing hashes in one query
  const existing = await db('tracks').select('persistent_id', 'content_hash', 'id')
  const existingMap = new Map<string, { hash: string; id: number }>(
    existing.map((r: { persistent_id: string; content_hash: string; id: number }) => [
      r.persistent_id,
      { hash: r.content_hash, id: r.id },
    ]),
  )

  const toInsert: Record<string, unknown>[] = []
  const toUpdate: Array<{ persistentId: string; row: Record<string, unknown> }> = []

  for (const raw of Object.values(rawTracks)) {
    const persistentId = String(raw['Persistent ID'] ?? '')
    if (!persistentId) continue

    const row = buildRow(raw, now)
    const existing = existingMap.get(persistentId)

    if (!existing) {
      row.created_at = now
      toInsert.push(row)
      result.addedItems.push({
        persistentId,
        name: raw['Name'] as string | undefined,
        artist: raw['Artist'] as string | undefined,
      })
    } else if (existing.hash !== row.content_hash) {
      toUpdate.push({ persistentId, row })
    } else {
      result.unchanged++
    }
  }

  result.added = toInsert.length
  result.updated = toUpdate.length

  // Batch inserts in chunks to avoid SQLite variable limit
  const CHUNK = 100
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await db('tracks').insert(toInsert.slice(i, i + CHUNK))
  }

  // Upsert updates individually (content changed)
  for (const { persistentId, row } of toUpdate) {
    const before = await db('tracks').where({ persistent_id: persistentId }).first()
    await db('tracks').where({ persistent_id: persistentId }).update(row)
    const changedFields: Record<string, { from: unknown; to: unknown }> = {}
    for (const [col, newVal] of Object.entries(row)) {
      if (col === 'updated_at' || col === 'content_hash') continue
      const oldVal = before[col]
      if (String(oldVal) !== String(newVal ?? '')) {
        changedFields[col] = { from: oldVal, to: newVal }
      }
    }
    result.updatedItems.push({ persistentId, changedFields })
  }

  return result
}
