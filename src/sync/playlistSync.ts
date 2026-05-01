import dayjs from 'dayjs'
import type { Knex } from 'knex'
import type { RawPlaylist } from '../parser/types'
import type { AddedPlaylistInfo, SyncCounts, UpdatedPlaylistInfo } from '../types'

export interface PlaylistSyncResult extends SyncCounts {
  addedItems: AddedPlaylistInfo[]
  updatedItems: UpdatedPlaylistInfo[]
}

function buildPlaylistRow(raw: RawPlaylist, now: string): Record<string, unknown> {
  return {
    persistent_id: raw['Playlist Persistent ID'],
    playlist_id: raw['Playlist ID'] ?? null,
    parent_persistent_id: raw['Parent Persistent ID'] ?? null,
    name: raw['Name'] ?? null,
    description: raw['Description'] ?? null,
    master: raw['Master'] ? 1 : null,
    all_items: raw['All Items'] ? 1 : null,
    visible: raw['Visible'] ? 1 : null,
    smart: raw['Smart Info'] !== undefined ? 1 : 0,
    folder: raw['Folder'] ? 1 : null,
    music: raw['Music'] ? 1 : null,
    movies: raw['Movies'] ? 1 : null,
    tv_shows: raw['TV Shows'] ? 1 : null,
    podcasts: raw['Podcasts'] ? 1 : null,
    audiobooks: raw['Audiobooks'] ? 1 : null,
    distinguished_kind: raw['Distinguished Kind'] ?? null,
    updated_at: now,
  }
}

export async function syncPlaylists(
  db: Knex,
  rawPlaylists: RawPlaylist[],
): Promise<PlaylistSyncResult> {
  const now = dayjs().toISOString()
  const result: PlaylistSyncResult = {
    added: 0,
    updated: 0,
    unchanged: 0,
    addedItems: [],
    updatedItems: [],
  }

  // Build a map of Apple track_id → db tracks.id for bridge resolution
  const trackIdMap = new Map<number, number>()
  const trackRows: { id: number; track_id: number }[] = await db('tracks').select('id', 'track_id')
  for (const r of trackRows) {
    if (r.track_id != null) trackIdMap.set(r.track_id, r.id)
  }

  // Load existing playlist persistent_ids
  const existing: { id: number; persistent_id: string }[] = await db('playlists').select('id', 'persistent_id')
  const existingMap = new Map(existing.map((r) => [r.persistent_id, r.id]))

  for (const raw of rawPlaylists) {
    const persistentId = raw['Playlist Persistent ID']
    if (!persistentId) continue

    const row = buildPlaylistRow(raw, now)
    const existingId = existingMap.get(persistentId)

    let playlistDbId: number

    if (existingId == null) {
      row.created_at = now
      const [inserted] = await db('playlists').insert(row).returning('id') as [{ id: number } | number]
      playlistDbId = typeof inserted === 'object' ? inserted.id : inserted
      result.added++
      result.addedItems.push({ persistentId, name: raw['Name'] })
    } else {
      const before = await db('playlists').where({ id: existingId }).first()
      await db('playlists').where({ id: existingId }).update(row)
      playlistDbId = existingId

      const changedFields: Record<string, { from: unknown; to: unknown }> = {}
      for (const [col, newVal] of Object.entries(row)) {
        if (col === 'updated_at') continue
        const oldVal = before[col]
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changedFields[col] = { from: oldVal, to: newVal }
        }
      }

      if (Object.keys(changedFields).length > 0) {
        result.updated++
        result.updatedItems.push({ persistentId, changedFields })
      } else {
        result.unchanged++
      }
    }

    // Sync bridge table: delete + re-insert within a transaction
    const items = raw['Playlist Items'] ?? []
    await db.transaction(async (trx) => {
      await trx('playlist_tracks').where({ playlist_id: playlistDbId }).delete()

      const bridgeRows: Record<string, unknown>[] = []
      for (let i = 0; i < items.length; i++) {
        const appleTrackId = items[i]['Track ID']
        const dbTrackId = trackIdMap.get(appleTrackId)
        if (dbTrackId == null) continue
        bridgeRows.push({
          playlist_id: playlistDbId,
          track_id: dbTrackId,
          position: i + 1,
          created_at: now,
        })
      }

      if (bridgeRows.length > 0) {
        // Chunk to avoid SQLite variable limit
        const CHUNK = 200
        for (let i = 0; i < bridgeRows.length; i += CHUNK) {
          await trx('playlist_tracks').insert(bridgeRows.slice(i, i + CHUNK))
        }
      }
    })
  }

  return result
}
