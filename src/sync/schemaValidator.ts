import type { RawLibrary } from '../parser/types'

export const KNOWN_TRACK_KEYS = new Set([
  'Track ID', 'Persistent ID', 'Name', 'Artist', 'Album Artist',
  'Album', 'Composer', 'Genre', 'Grouping', 'Work', 'Movement Name',
  'Movement Number', 'Movement Count', 'Kind', 'Track Type', 'Location',
  'Year', 'Track Number', 'Track Count', 'Disc Number', 'Disc Count',
  'Total Time', 'Bit Rate', 'Sample Rate', 'Size',
  'Play Count', 'Skip Count', 'Normalization', 'Artwork Count',
  'File Folder Count', 'Library Folder Count',
  'Play Date', 'Play Date UTC', 'Skip Date', 'Release Date',
  'Date Added', 'Date Modified',
  'Sort Name', 'Sort Artist', 'Sort Album Artist', 'Sort Album', 'Sort Composer',
  'Loved', 'Disliked', 'Favorited', 'Clean', 'Explicit',
  'Compilation', 'Purchased', 'Apple Music', 'Has Video', 'HD',
  'Music Video', 'Playlist Only', 'Part Of Gapless Album',
])

export const KNOWN_PLAYLIST_KEYS = new Set([
  'Name', 'Playlist ID', 'Playlist Persistent ID', 'Parent Persistent ID',
  'Description', 'Master', 'All Items', 'Visible',
  'Smart Info', 'Smart Criteria',
  'Folder', 'Music', 'Movies', 'TV Shows', 'Podcasts', 'Audiobooks',
  'Distinguished Kind', 'Playlist Items',
])

export interface SchemaWarnings {
  unknownTrackKeys: string[]
  unknownPlaylistKeys: string[]
  affectedTrackIds: Record<string, string[]>
  affectedPlaylistIds: Record<string, string[]>
}

export function validateSchema(library: RawLibrary): SchemaWarnings {
  const affectedTrackIds: Record<string, string[]> = {}
  const affectedPlaylistIds: Record<string, string[]> = {}

  for (const rawTrack of Object.values(library.Tracks)) {
    const persistentId = String(rawTrack['Persistent ID'] ?? '')
    for (const key of Object.keys(rawTrack)) {
      if (!KNOWN_TRACK_KEYS.has(key)) {
        if (!affectedTrackIds[key]) affectedTrackIds[key] = []
        affectedTrackIds[key].push(persistentId)
      }
    }
  }

  for (const playlist of library.Playlists) {
    const persistentId = String(playlist['Playlist Persistent ID'] ?? '')
    for (const key of Object.keys(playlist)) {
      if (!KNOWN_PLAYLIST_KEYS.has(key)) {
        if (!affectedPlaylistIds[key]) affectedPlaylistIds[key] = []
        affectedPlaylistIds[key].push(persistentId)
      }
    }
  }

  return {
    unknownTrackKeys: Object.keys(affectedTrackIds),
    unknownPlaylistKeys: Object.keys(affectedPlaylistIds),
    affectedTrackIds,
    affectedPlaylistIds,
  }
}
