# Implementation Plan: Apple Music Library Sync System

## Overview

Parse Apple Music plist XML exports into a SQLite database, track sync history, generate reports, and expose a queryable API. The system is designed for repeated syncs as new exports are produced.

---

## Project Structure

```
lamusica/
├── src/
│   ├── config/
│   │   └── database.ts          # Knex connection singleton
│   ├── db/
│   │   └── migrations/
│   │       ├── 001_sync_runs.ts
│   │       ├── 002_tracks.ts
│   │       ├── 003_playlists.ts
│   │       └── 004_playlist_tracks.ts
│   ├── parser/
│   │   ├── plistParser.ts       # XML → raw JS objects
│   │   └── types.ts             # Raw plist types
│   ├── sync/
│   │   ├── syncService.ts       # Orchestrates a full sync run
│   │   ├── trackSync.ts         # Upsert logic for tracks
│   │   ├── playlistSync.ts      # Upsert logic for playlists + bridge
│   │   └── schemaValidator.ts   # Detects unknown keys
│   ├── reports/
│   │   └── reportGenerator.ts   # Writes .md report files
│   ├── patches/
│   │   └── patchGenerator.ts    # Writes patch JSON files for reprocessing
│   ├── api/
│   │   ├── server.ts            # Express app setup
│   │   ├── routes/
│   │   │   ├── tracks.ts
│   │   │   ├── playlists.ts
│   │   │   └── syncRuns.ts
│   │   └── middleware/
│   │       └── errorHandler.ts
│   └── types/
│       └── index.ts             # Shared domain types
├── scripts/
│   └── query.ts                 # CLI driver for auditing
├── music-lib/                   # Drop XML exports here
├── reports/                     # Generated markdown reports
├── patches/                     # Generated patch files
├── knexfile.ts
├── package.json
└── tsconfig.json
```

---

## Database Schema

### Table: `sync_runs`

Tracks each import execution for auditability and replay.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `source_file` | TEXT NOT NULL | filename of the XML export (e.g., `05012026.xml`) |
| `started_at` | DATETIME NOT NULL | |
| `completed_at` | DATETIME | null if failed |
| `status` | TEXT NOT NULL | `success`, `partial`, `failed` |
| `tracks_added` | INTEGER | |
| `tracks_updated` | INTEGER | |
| `tracks_unchanged` | INTEGER | |
| `playlists_added` | INTEGER | |
| `playlists_updated` | INTEGER | |
| `playlists_unchanged` | INTEGER | |
| `unknown_track_keys` | TEXT | JSON array of unrecognized keys found in tracks |
| `unknown_playlist_keys` | TEXT | JSON array of unrecognized keys found in playlists |
| `report_path` | TEXT | relative path to the generated report file |
| `patch_path` | TEXT | relative path to the generated patch file (null if none) |
| `error_message` | TEXT | populated on failure |

---

### Table: `tracks`

One row per unique track, keyed by Apple's `Persistent ID`. All 57 known track keys from the plist format are included.

| Column | Type | Source Key |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `persistent_id` | TEXT UNIQUE NOT NULL | `Persistent ID` |
| `track_id` | INTEGER | `Track ID` |
| `name` | TEXT | `Name` |
| `artist` | TEXT | `Artist` |
| `album_artist` | TEXT | `Album Artist` |
| `album` | TEXT | `Album` |
| `composer` | TEXT | `Composer` |
| `genre` | TEXT | `Genre` |
| `grouping` | TEXT | `Grouping` |
| `work` | TEXT | `Work` |
| `movement_name` | TEXT | `Movement Name` |
| `movement_number` | INTEGER | `Movement Number` |
| `movement_count` | INTEGER | `Movement Count` |
| `kind` | TEXT | `Kind` |
| `track_type` | TEXT | `Track Type` |
| `location` | TEXT | `Location` |
| `year` | INTEGER | `Year` |
| `track_number` | INTEGER | `Track Number` |
| `track_count` | INTEGER | `Track Count` |
| `disc_number` | INTEGER | `Disc Number` |
| `disc_count` | INTEGER | `Disc Count` |
| `total_time` | INTEGER | `Total Time` (ms) |
| `bit_rate` | INTEGER | `Bit Rate` |
| `sample_rate` | INTEGER | `Sample Rate` |
| `size` | INTEGER | `Size` (bytes) |
| `play_count` | INTEGER | `Play Count` |
| `skip_count` | INTEGER | `Skip Count` |
| `normalization` | INTEGER | `Normalization` |
| `artwork_count` | INTEGER | `Artwork Count` |
| `file_folder_count` | INTEGER | `File Folder Count` |
| `library_folder_count` | INTEGER | `Library Folder Count` |
| `play_date` | INTEGER | `Play Date` (Mac epoch) |
| `play_date_utc` | DATETIME | `Play Date UTC` |
| `skip_date` | DATETIME | `Skip Date` |
| `release_date` | DATETIME | `Release Date` |
| `date_added` | DATETIME | `Date Added` |
| `date_modified` | DATETIME | `Date Modified` |
| `sort_name` | TEXT | `Sort Name` |
| `sort_artist` | TEXT | `Sort Artist` |
| `sort_album_artist` | TEXT | `Sort Album Artist` |
| `sort_album` | TEXT | `Sort Album` |
| `sort_composer` | TEXT | `Sort Composer` |
| `loved` | BOOLEAN | `Loved` |
| `disliked` | BOOLEAN | `Disliked` |
| `favorited` | BOOLEAN | `Favorited` |
| `clean` | BOOLEAN | `Clean` |
| `explicit` | BOOLEAN | `Explicit` |
| `compilation` | BOOLEAN | `Compilation` |
| `purchased` | BOOLEAN | `Purchased` |
| `apple_music` | BOOLEAN | `Apple Music` |
| `has_video` | BOOLEAN | `Has Video` |
| `hd` | BOOLEAN | `HD` |
| `music_video` | BOOLEAN | `Music Video` |
| `playlist_only` | BOOLEAN | `Playlist Only` |
| `part_of_gapless_album` | BOOLEAN | `Part Of Gapless Album` |
| `created_at` | DATETIME | set on first insert |
| `updated_at` | DATETIME | updated on every upsert |

---

### Table: `playlists`

One row per playlist, keyed by `Persistent ID`. Playlists in the plist include special entries (the master library, folders, smart playlists) — all are stored and distinguished by flags.

| Column | Type | Source Key |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `persistent_id` | TEXT UNIQUE NOT NULL | `Playlist Persistent ID` |
| `playlist_id` | INTEGER | `Playlist ID` |
| `parent_persistent_id` | TEXT | `Parent Persistent ID` (for folders) |
| `name` | TEXT | `Name` |
| `description` | TEXT | `Description` |
| `master` | BOOLEAN | `Master` |
| `all_items` | BOOLEAN | `All Items` |
| `visible` | BOOLEAN | `Visible` |
| `smart` | BOOLEAN | `Smart Info` presence indicates smart playlist |
| `folder` | BOOLEAN | `Folder` |
| `music` | BOOLEAN | `Music` |
| `movies` | BOOLEAN | `Movies` |
| `tv_shows` | BOOLEAN | `TV Shows` |
| `podcasts` | BOOLEAN | `Podcasts` |
| `audiobooks` | BOOLEAN | `Audiobooks` |
| `distinguished_kind` | INTEGER | `Distinguished Kind` |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

### Table: `playlist_tracks` (bridge)

Resolves the many-to-many relationship between playlists and tracks. Position preserves the order of tracks within each playlist.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `playlist_id` | INTEGER NOT NULL | FK → `playlists.id` |
| `track_id` | INTEGER NOT NULL | FK → `tracks.id` |
| `position` | INTEGER NOT NULL | 1-based order within the playlist |
| `created_at` | DATETIME | |

**Constraint:** `UNIQUE(playlist_id, track_id)`

**Sync strategy:** On each sync, delete all rows for a given playlist and re-insert from the current export. This is safe because the bridge rows carry no user-editable state.

---

## Step-by-Step Implementation

### Step 1 — Project Scaffolding

1. Initialize `package.json` with scripts: `build`, `sync`, `serve`, `query`, `migrate`, `migrate:rollback`
2. Configure `tsconfig.json` targeting Node 18+, `strict: true`, `outDir: dist`
3. Install dependencies:
   - **Runtime:** `express`, `knex`, `better-sqlite3`, `fast-xml-parser`, `plist`, `commander`, `chalk`, `dayjs`
   - **Dev:** `typescript`, `@types/node`, `@types/express`, `@types/better-sqlite3`, `ts-node`, `tsx`
4. Create `knexfile.ts` with development/production configs pointing to `lamusica.db`
5. Create `src/config/database.ts` exporting a shared Knex instance

---

### Step 2 — Database Migrations

Create four migration files in `src/db/migrations/` (run via `knex migrate:latest`):

- `001_sync_runs.ts` — creates `sync_runs`
- `002_tracks.ts` — creates `tracks` with all columns and a unique index on `persistent_id`
- `003_playlists.ts` — creates `playlists` with unique index on `persistent_id`
- `004_playlist_tracks.ts` — creates `playlist_tracks` with FK constraints and the composite unique index

Each migration includes both `up` and `down` functions.

---

### Step 3 — Plist Parser (`src/parser/`)

**`types.ts`** — Define raw types matching the plist structure:
```typescript
export interface RawTrack {
  [key: string]: string | number | boolean | Date
}

export interface RawPlaylist {
  Name: string
  'Playlist ID': number
  'Playlist Persistent ID': string
  'Playlist Items'?: Array<{ 'Track ID': number }>
  [key: string]: unknown
}

export interface RawLibrary {
  'Major Version': number
  'Minor Version': number
  'Application Version': string
  Date: Date
  'Features': number
  'Show Content Ratings': boolean
  'Library Persistent ID': string
  Tracks: Record<string, RawTrack>
  Playlists: RawPlaylist[]
}
```

**`plistParser.ts`** — Use the `plist` npm package (handles Apple plist format correctly, including typed values):
```typescript
import plist from 'plist'
import fs from 'fs'

export function parseLibraryFile(filePath: string): RawLibrary {
  const xml = fs.readFileSync(filePath, 'utf-8')
  return plist.parse(xml) as RawLibrary
}
```

The `plist` package correctly deserializes integer, string, boolean, date, and data elements — no manual XML walking required.

---

### Step 4 — Schema Validator (`src/sync/schemaValidator.ts`)

Maintain a constant set of known track keys and known playlist keys. On each sync, collect any keys from the raw data that are not in the known sets.

```typescript
export const KNOWN_TRACK_KEYS = new Set([
  'Track ID', 'Persistent ID', 'Name', 'Artist', 'Album Artist',
  'Album', 'Composer', 'Genre', 'Grouping', 'Work', 'Movement Name',
  // ... all 57 known keys
])

export const KNOWN_PLAYLIST_KEYS = new Set([
  'Name', 'Playlist ID', 'Playlist Persistent ID', 'Parent Persistent ID',
  'Description', 'Master', 'All Items', 'Visible', 'Smart Info',
  // ... all known playlist keys
])

export interface SchemaWarnings {
  unknownTrackKeys: string[]
  unknownPlaylistKeys: string[]
  affectedTrackIds: Record<string, string[]>   // key → [persistentId, ...]
  affectedPlaylistIds: Record<string, string[]> // key → [persistentId, ...]
}

export function validateSchema(library: RawLibrary): SchemaWarnings
```

---

### Step 5 — Sync Service (`src/sync/`)

**`trackSync.ts`** — Maps raw plist track keys to `tracks` columns and upserts via Knex:
- Build a `columnMap: Record<string, string>` mapping plist keys to column names (e.g., `"Album Artist"` → `"album_artist"`)
- For each raw track, produce a row object with only known mapped columns
- Upsert using `knex.insert(...).onConflict('persistent_id').merge()` (Knex SQLite upsert)
- Return counts of added/updated/unchanged rows

**`playlistSync.ts`** — Similar approach for playlists:
- Upsert playlist rows by `persistent_id`
- For the bridge: within a transaction, delete all `playlist_tracks` rows for the playlist, then re-insert the current ordered track list
- Resolve `track_id` from the `tracks` table by `track_id` (Apple's integer ID) for the bridge inserts

**`syncService.ts`** — Top-level orchestrator:
1. Create a `sync_runs` row with status `running`
2. Call `parseLibraryFile(filePath)`
3. Call `validateSchema(library)` — collect warnings
4. Call `trackSync.sync(tracks)` — collect counts
5. Call `playlistSync.sync(playlists)` — collect counts
6. Call `reportGenerator.generate(syncRunId, results)` — write report
7. If schema warnings exist, call `patchGenerator.generate(warnings, affectedData)`
8. Update `sync_runs` row to `success` (or `partial` if warnings exist) with all counts and file paths

---

### Step 6 — Patch Generator (`src/patches/patchGenerator.ts`)

When unknown keys are detected, produce two outputs:

**1. Report section** (embedded in the sync report):
- Lists each unknown key, its inferred type (string/integer/boolean/date), example values, and which track/playlist IDs it appeared on
- Includes a suggested `ALTER TABLE` statement for each key

**2. Patch file** (written to `patches/<runId>-patch.json`):
```json
{
  "syncRunId": 42,
  "generatedAt": "2026-05-01T12:00:00Z",
  "unknownTrackKeys": [
    {
      "key": "Some New Key",
      "inferredType": "string",
      "suggestedColumn": "some_new_key",
      "suggestedMigration": "ALTER TABLE tracks ADD COLUMN some_new_key TEXT;",
      "affectedPersistentIds": ["A1B2C3...", "D4E5F6..."],
      "sampleValues": ["value1", "value2"]
    }
  ],
  "unknownPlaylistKeys": [],
  "reprocessInstructions": "After applying the suggested migration, re-run the sync with: npm run sync -- --file <source_file> --patch-run <syncRunId>"
}
```

The patch file serves as the input for a future `--patch-run` mode that replays only the affected records.

---

### Step 7 — Report Generator (`src/reports/reportGenerator.ts`)

Writes `reports/<YYYYMMDD-HHmmss>-sync.md` after each run.

**Report structure:**

```markdown
# Sync Report — 2026-05-01 12:00:00

## Run Details
```json
{ "syncRunId": 42, "sourceFile": "05012026.xml", "status": "success", ... }
```

## Summary

| Metric | Count |
|---|---|
| Tracks added | 120 |
| Tracks updated | 45 |
...

## Track Changes

### Added Tracks
```json
[{ "persistentId": "...", "name": "...", "artist": "..." }, ...]
```

### Updated Tracks
```json
[{ "persistentId": "...", "changedFields": { "playCount": { "from": 5, "to": 8 } } }, ...]
```

## Playlist Changes
...

## Schema Warnings

> **Action required:** Unknown keys were detected. A patch file has been written to `patches/42-patch.json`.

### Unknown Track Keys
...

### Suggested Migrations
```sql
ALTER TABLE tracks ADD COLUMN some_new_key TEXT;
```

## Patch File
`patches/42-patch.json`
```

---

### Step 8 — Express API (`src/api/`)

A thin read-only REST API for querying the database. Supports the driver script and future UI development.

**Routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sync-runs` | List all sync runs (paginated) |
| `GET` | `/api/sync-runs/:id` | Get a specific sync run |
| `GET` | `/api/tracks` | List tracks with filter/sort/pagination |
| `GET` | `/api/tracks/:persistentId` | Get a single track |
| `GET` | `/api/playlists` | List all playlists |
| `GET` | `/api/playlists/:persistentId` | Get a playlist with its tracks |
| `GET` | `/api/playlists/:persistentId/tracks` | List tracks in a playlist |
| `POST` | `/api/sync` | Trigger a sync run by providing a file path |

**Query parameters for `/api/tracks`:**
- `artist`, `album`, `genre` — exact match filters
- `search` — full-text search across name, artist, album
- `loved`, `explicit`, `compilation` — boolean filters
- `sort` — e.g., `play_count:desc`, `name:asc`
- `limit`, `offset` — pagination

---

### Step 9 — Driver Script (`scripts/query.ts`)

A `commander`-based CLI for terminal auditing, separate from the API server.

```
Usage: npm run query -- <command> [options]

Commands:
  sync <file>                 Run a sync against an XML export file
  tracks [options]            Query tracks
  playlists [options]         Query playlists
  playlist-tracks <name>      List tracks in a playlist
  sync-runs                   List sync run history
  report <runId>              Print the report for a specific run
  patch <runId>               Print the patch file for a specific run
  stats                       Print aggregate library stats
  schema-check <file>         Validate a new export against the current schema without importing

Options for tracks:
  --artist <name>
  --album <name>
  --genre <name>
  --loved
  --unplayed
  --sort <field:direction>
  --limit <n>
  --format <table|json|csv>   Default: table
```

---

## npm Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "migrate": "knex migrate:latest",
    "migrate:rollback": "knex migrate:rollback",
    "serve": "tsx src/api/server.ts",
    "sync": "tsx scripts/query.ts sync",
    "query": "tsx scripts/query.ts"
  }
}
```

---

## Key Design Decisions

**Upsert strategy:** Tracks are upserted by `persistent_id` (Apple's stable, unique identifier). `track_id` is Apple's internal integer ID and can change between exports, so it is stored but not used as the upsert key.

**Playlist bridge:** The bridge table is fully replaced per playlist on each sync. This avoids complex diffing logic while keeping the data current. Position is preserved from the plist's `Playlist Items` array order.

**Date handling:** The `plist` package returns JavaScript `Date` objects for plist `<date>` elements. Store all dates as ISO 8601 strings in SQLite.

**Boolean handling:** Plist booleans are `<true/>` and `<false/>` elements. The `plist` package returns these as JS booleans; store as `0`/`1` integers in SQLite.

**`play_date` vs `play_date_utc`:** Apple stores two play date representations — a Mac epoch integer (`play_date`) and an ISO date string (`play_date_utc`). Both are stored; prefer `play_date_utc` for queries.

---

## Additional Recommendations

### 1. Schema Version Table
Add a `schema_version` metadata table (separate from Knex's own migration table) that records which plist keys were known at the time of each sync run. This makes it easy to audit schema evolution over time.

### 2. Incremental Sync Optimization
For large libraries (32k+ tracks), computing change diffs in memory before writing to the DB is faster than issuing individual upserts. Load all current `persistent_id` + hash-of-fields into a Map, compare against incoming data, and batch-insert only actual changes.

A lightweight hash: `SHA1(JSON.stringify(sortedKnownFields))` per track. Store the hash in the `tracks` table as a `content_hash` column to make unchanged detection O(1).

### 3. File Naming Convention
The export file `05012026.xml` follows `MMDDYYYY` format. The sync service should parse this date from the filename and store it as `export_date` on the `sync_runs` row — useful for sorting runs chronologically without relying on file system timestamps.

### 4. Dry-Run Mode
Add a `--dry-run` flag to the sync command that parses and validates the file, generates a report preview, and reports what *would* change — without writing to the database. Useful for pre-flight checks on new exports.

### 5. Playlist Hierarchy
The plist includes folder playlists with `Parent Persistent ID` references. The `playlists.parent_persistent_id` column preserves this hierarchy. The API and driver script should expose a `--tree` flag on the playlists command to visualize the folder structure.

### 6. Data Integrity Checks
After each sync, run a set of post-sync assertions and include results in the report:
- All `playlist_tracks.track_id` values resolve to a row in `tracks`
- No duplicate `persistent_id` values in `tracks` or `playlists`
- Track counts per playlist match the plist source

---

## File Delivery Order

| Step | Deliverable |
|---|---|
| 1 | `package.json`, `tsconfig.json`, `knexfile.ts` |
| 2 | `src/db/migrations/001–004` |
| 3 | `src/parser/types.ts`, `src/parser/plistParser.ts` |
| 4 | `src/sync/schemaValidator.ts` |
| 5 | `src/sync/trackSync.ts`, `src/sync/playlistSync.ts`, `src/sync/syncService.ts` |
| 6 | `src/patches/patchGenerator.ts` |
| 7 | `src/reports/reportGenerator.ts` |
| 8 | `src/api/server.ts`, routes, middleware |
| 9 | `scripts/query.ts` |
