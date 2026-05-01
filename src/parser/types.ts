export interface RawTrack {
  [key: string]: string | number | boolean | Date | undefined
}

export interface RawPlaylist {
  Name: string
  'Playlist ID': number
  'Playlist Persistent ID': string
  'Parent Persistent ID'?: string
  Description?: string
  Master?: boolean
  'All Items'?: boolean
  Visible?: boolean
  'Smart Info'?: unknown
  'Smart Criteria'?: unknown
  Folder?: boolean
  Music?: boolean
  Movies?: boolean
  'TV Shows'?: boolean
  Podcasts?: boolean
  Audiobooks?: boolean
  'Distinguished Kind'?: number
  'Playlist Items'?: Array<{ 'Track ID': number }>
  [key: string]: unknown
}

export interface RawLibrary {
  'Major Version': number
  'Minor Version': number
  'Application Version': string
  Date: Date
  Features: number
  'Show Content Ratings': boolean
  'Music Folder'?: string
  'Library Persistent ID': string
  Tracks: Record<string, RawTrack>
  Playlists: RawPlaylist[]
}
