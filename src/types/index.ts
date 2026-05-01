export interface SyncCounts {
  added: number
  updated: number
  unchanged: number
}

export interface SyncResult {
  syncRunId: number
  sourceFile: string
  status: 'success' | 'partial' | 'failed'
  tracks: SyncCounts & {
    addedItems: AddedTrackInfo[]
    updatedItems: UpdatedTrackInfo[]
  }
  playlists: SyncCounts & {
    addedItems: AddedPlaylistInfo[]
    updatedItems: UpdatedPlaylistInfo[]
  }
  unknownTrackKeys: string[]
  unknownPlaylistKeys: string[]
  reportPath?: string
  patchPath?: string
}

export interface AddedTrackInfo {
  persistentId: string
  name?: string
  artist?: string
}

export interface UpdatedTrackInfo {
  persistentId: string
  changedFields: Record<string, { from: unknown; to: unknown }>
}

export interface AddedPlaylistInfo {
  persistentId: string
  name?: string
}

export interface UpdatedPlaylistInfo {
  persistentId: string
  changedFields: Record<string, { from: unknown; to: unknown }>
}

export interface TrackRow {
  id: number
  persistent_id: string
  track_id: number | null
  name: string | null
  artist: string | null
  album_artist: string | null
  album: string | null
  composer: string | null
  genre: string | null
  grouping: string | null
  work: string | null
  movement_name: string | null
  movement_number: number | null
  movement_count: number | null
  kind: string | null
  track_type: string | null
  location: string | null
  year: number | null
  track_number: number | null
  track_count: number | null
  disc_number: number | null
  disc_count: number | null
  total_time: number | null
  bit_rate: number | null
  sample_rate: number | null
  size: number | null
  play_count: number | null
  skip_count: number | null
  normalization: number | null
  artwork_count: number | null
  file_folder_count: number | null
  library_folder_count: number | null
  play_date: number | null
  play_date_utc: string | null
  skip_date: string | null
  release_date: string | null
  date_added: string | null
  date_modified: string | null
  sort_name: string | null
  sort_artist: string | null
  sort_album_artist: string | null
  sort_album: string | null
  sort_composer: string | null
  loved: boolean | null
  disliked: boolean | null
  favorited: boolean | null
  clean: boolean | null
  explicit: boolean | null
  compilation: boolean | null
  purchased: boolean | null
  apple_music: boolean | null
  has_video: boolean | null
  hd: boolean | null
  music_video: boolean | null
  playlist_only: boolean | null
  part_of_gapless_album: boolean | null
  content_hash: string | null
  created_at: string
  updated_at: string
}

export interface PlaylistRow {
  id: number
  persistent_id: string
  playlist_id: number | null
  parent_persistent_id: string | null
  name: string | null
  description: string | null
  master: boolean | null
  all_items: boolean | null
  visible: boolean | null
  smart: boolean | null
  folder: boolean | null
  music: boolean | null
  movies: boolean | null
  tv_shows: boolean | null
  podcasts: boolean | null
  audiobooks: boolean | null
  distinguished_kind: number | null
  created_at: string
  updated_at: string
}

export interface SyncRunRow {
  id: number
  source_file: string
  started_at: string
  completed_at: string | null
  status: string
  tracks_added: number | null
  tracks_updated: number | null
  tracks_unchanged: number | null
  playlists_added: number | null
  playlists_updated: number | null
  playlists_unchanged: number | null
  unknown_track_keys: string | null
  unknown_playlist_keys: string | null
  report_path: string | null
  patch_path: string | null
  error_message: string | null
}
