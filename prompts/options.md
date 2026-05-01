# Apple Music Library — Programmatic Analysis: Options & API Design

## Assessment of Options

### Option 1: Apple Music Developer API (MusicKit REST)

**How it works:** A token-authenticated REST API (`https://api.music.apple.com/v1/`) that exposes both the Apple Music catalog and your personal library.

**Setup requirements:**
- Apple Developer Program membership ($99/year)
- Create a MusicKit identifier + private key in App Store Connect
- Generate a **developer token**: a short-lived JWT (ES256, max 6-month TTL) signed with your private key
- Obtain a **user token**: requires MusicKit.js in a browser, or the native MusicKit framework on macOS/iOS — there is no headless CLI path to get this without user interaction

**What it can access:**
- `GET /v1/me/library/songs` — all songs in your library
- `GET /v1/me/library/albums`, `/artists`, `/playlists`
- `GET /v1/me/recent/played` — recently played content
- `GET /v1/me/ratings/songs` — star ratings
- `GET /v1/catalog/{storefront}/search` — full Apple Music catalog

**Pagination:** cursor-based (`limit` + `offset`, or `next` cursor in response)

**Pros:** Works cross-platform; accesses streaming catalog metadata (artwork, ISRC, etc.); real-time data; official and stable.

**Cons:** Developer account required; two-token auth flow is non-trivial to automate headlessly; overkill for local library analysis; rate limits apply (undocumented, but practical).

**Verdict:** Best when you need cross-platform access, catalog search, or integration with external services. For personal library scripting on macOS, it is unnecessary complexity.

---

### Option 2: AppleScript / JXA (JavaScript for Automation) — Recommended

**How it works:** macOS automation frameworks that let you control and query `Music.app` directly via `osascript`. No tokens, no accounts, no network.

**Setup requirements:** None — available on every Mac running Music.app.

**What it can access:**
- All tracks (title, artist, album, genre, duration, play count, rating, loved, date added, last played, BPM, year, track number, file path)
- All playlists (including smart playlists), their contents and metadata
- Playback controls, playlist creation, rating modification

**Example — dump all tracks as JSON via Node.js:**
```javascript
const { execSync } = require('child_process')

const jxa = `
  const app = Application('Music')
  const tracks = app.tracks()
  JSON.stringify(tracks.map(t => ({
    id: t.persistentID(),
    title: t.name(),
    artist: t.artist(),
    album: t.album(),
    genre: t.genre(),
    playCount: t.playedCount(),
    rating: t.rating(),
    loved: t.loved(),
    duration: t.duration(),
    dateAdded: t.dateAdded()?.toISOString(),
    lastPlayed: t.played()?.toISOString(),
    year: t.year(),
    bpm: t.bpm()
  })))
`
const result = execSync(`osascript -l JavaScript -e '${jxa}'`)
const tracks = JSON.parse(result.toString())
```

**Pros:** Zero setup; live data from Music.app; read/write (can create playlists, set ratings); works with local files and iCloud Music Library; very fast for filtered queries.

**Cons:** macOS only; large libraries (10k+ tracks) can be slow without batching; smart playlist logic is read-only (can't create smart playlists via JXA).

**Verdict:** Best choice for local scripting workflows. Should be the primary data source.

---

### Option 3: iTunes/Music Library XML Export

**How it works:** Music.app can export your entire library as a plist-format XML file via `File > Library > Export Library...`. Contains all tracks and playlists.

**Setup requirements:** One-time manual export (or scripted via JXA: `Application('Music').export({...})`).

**What it can access:** Same metadata as JXA — tracks, albums, artists, playlists, ratings, play counts. Does not include streaming-only content not in your library.

**Parsing example (Python):**
```python
import plistlib

with open('Library.xml', 'rb') as f:
    lib = plistlib.load(f)

tracks = lib['Tracks']  # dict keyed by track ID
playlists = lib['Playlists']
```

**Pros:** Simplest parsing; works offline; no macOS automation needed (useful in CI or on non-Mac machines after export); full fidelity snapshot.

**Cons:** Static — requires re-export to refresh; manual step unless automated; slightly stale vs. live JXA.

**Verdict:** Best for offline analysis, reproducible snapshots, or sharing library data. Use alongside JXA for a cache/persistence layer.

---

### Option 4: Third-Party Tools (beets, MusicBrainz, Last.fm)

Tools like [beets](https://beets.io/) manage local music files and can enrich metadata from MusicBrainz/Last.fm. Not Apple Music-aware (won't see iCloud tracks or streaming plays), but useful if you also have local files and want genre normalization, duplicate detection, or cross-referencing listen history from Last.fm.

**Verdict:** Supplementary only — useful for file-based libraries, not as a primary Apple Music data source.

---

## Recommendation Summary

| Use Case | Best Option |
|---|---|
| Local library analysis on macOS | JXA (live) or XML (snapshot) |
| Cross-platform or CI/CD | XML export + parse |
| Catalog search / streaming metadata | Apple Music API |
| Scrobbling / listen history | Last.fm API (supplementary) |

---

## High-Level API Design

A thin Python library (`lamusica`) with pluggable backends, a unified data model, and a fluent query interface.

### Architecture

```
┌─────────────────────────────────────────────┐
│              lamusica                        │
│                                              │
│  ┌──────────┐   Query   ┌────────────────┐  │
│  │ Library  │ ────────► │ QueryBuilder   │  │
│  │ (facade) │           └────────────────┘  │
│  └────┬─────┘                               │
│       │ delegates                           │
│  ┌────┴──────────────────────────────────┐  │
│  │            Backend (protocol)         │  │
│  ├──────────┬──────────┬─────────────────┤  │
│  │ JXABackend│XMLBackend│ APIBackend      │  │
│  └──────────┴──────────┴─────────────────┘  │
└─────────────────────────────────────────────┘
```

### Data Models

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class Song:
    id: str
    title: str
    artist: str
    album: str
    genre: str
    duration: float          # seconds
    play_count: int
    rating: int              # 0–100 (20=1★, 40=2★, 60=3★, 80=4★, 100=5★)
    loved: bool
    date_added: datetime
    last_played: datetime | None
    year: int | None
    track_number: int | None
    bpm: int | None

@dataclass
class Album:
    id: str
    name: str
    artist: str
    year: int | None
    genre: str
    tracks: list[Song] = field(default_factory=list)

    @property
    def play_count(self) -> int:
        return sum(s.play_count for s in self.tracks)

    @property
    def played_ratio(self) -> float:
        if not self.tracks:
            return 0.0
        return sum(1 for s in self.tracks if s.play_count > 0) / len(self.tracks)

    @property
    def total_duration(self) -> float:
        return sum(s.duration for s in self.tracks)

@dataclass
class Artist:
    id: str
    name: str
    albums: list[Album] = field(default_factory=list)

    @property
    def genres(self) -> list[str]:
        return list({a.genre for a in self.albums if a.genre})

    @property
    def total_plays(self) -> int:
        return sum(a.play_count for a in self.albums)

@dataclass
class Playlist:
    id: str
    name: str
    tracks: list[Song] = field(default_factory=list)
    description: str = ''
    date_modified: datetime | None = None
    is_smart: bool = False
```

### Library Facade

```python
from lamusica import MusicLibrary

# Auto-detect best available backend (JXA > XML > API)
lib = MusicLibrary()

# Explicit backends
lib = MusicLibrary.from_jxa()
lib = MusicLibrary.from_xml('~/Music/Library.xml')
lib = MusicLibrary.from_api(developer_token='...', user_token='...')

# ── Basic access ─────────────────────────────────────────────
songs     = lib.songs()      # List[Song]
albums    = lib.albums()     # List[Album]
artists   = lib.artists()    # List[Artist]
playlists = lib.playlists()  # List[Playlist]

# ── Filtering ────────────────────────────────────────────────
loved     = lib.songs(loved=True)
unplayed  = lib.songs(play_count=0)
five_star = lib.songs(rating=100)
jazz      = lib.songs(genre='Jazz')
recent    = lib.songs(added_after='2024-01-01')
stale     = lib.songs(last_played_before='2023-01-01')

# Arbitrary predicate
heavy     = lib.songs(where=lambda s: s.play_count > 50)

# ── Sorting & limiting ────────────────────────────────────────
top50     = lib.songs(sort='-play_count', limit=50)   # '-' = descending
newest    = lib.albums(sort='-year', limit=20)

# ── Analytics ────────────────────────────────────────────────
stats = lib.stats()
# {
#   'total_songs': 4218,
#   'total_albums': 312,
#   'total_artists': 187,
#   'total_duration_hours': 273.4,
#   'total_plays': 18042,
#   'genres': {'Rock': 1200, 'Jazz': 340, ...},
#   'unplayed_songs': 821,
#   'loved_songs': 143,
# }

top_artists    = lib.top_artists(by='play_count', limit=10)
genre_breakdown = lib.genre_stats()   # {genre: {songs, plays, duration}}

# ── Export ────────────────────────────────────────────────────
lib.export('json',   path='library.json')
lib.export('csv',    path='songs.csv', resource='songs')
lib.export('sqlite', path='library.db')  # enables ad-hoc SQL queries
```

### Example Workflow Scripts

```python
# ── workflow: find partially-listened albums ──────────────────
partial = [a for a in lib.albums()
           if 0 < a.played_ratio < 0.5]
partial.sort(key=lambda a: a.played_ratio)
for a in partial[:20]:
    print(f"{a.artist} – {a.name}  ({a.played_ratio:.0%} heard)")

# ── workflow: rediscover forgotten 4–5 star songs ─────────────
from datetime import datetime, timedelta
cutoff = datetime.now() - timedelta(days=365)
forgotten = lib.songs(
    where=lambda s: s.rating >= 80
                    and (s.last_played is None or s.last_played < cutoff)
)
lib.create_playlist('Rediscover', tracks=forgotten[:50])

# ── workflow: genre deep-dive ─────────────────────────────────
jazz_albums = lib.albums(genre='Jazz', sort='-play_count')
for a in jazz_albums[:10]:
    print(f"{a.name} — {a.total_plays} plays, "
          f"{a.played_ratio:.0%} complete")

# ── workflow: library health report ──────────────────────────
stats = lib.stats()
print(f"Library: {stats['total_songs']} songs, "
      f"{stats['total_duration_hours']:.0f}h")
print(f"Unplayed: {stats['unplayed_songs']} "
      f"({stats['unplayed_songs']/stats['total_songs']:.0%})")
print(f"Loved:    {stats['loved_songs']}")

# ── workflow: find duplicates ─────────────────────────────────
from collections import defaultdict
by_key = defaultdict(list)
for s in lib.songs():
    key = (s.title.lower(), s.artist.lower())
    by_key[key].append(s)
dupes = {k: v for k, v in by_key.items() if len(v) > 1}
```

---

## Recommended Implementation Path

1. **Start with the XML backend** — export once, parse with `plistlib`, build and validate data models. Zero setup friction.
2. **Add JXA backend** — wrap `osascript -l JavaScript` calls; use the same models. This gives live data and write-back (playlist creation, rating changes).
3. **Add SQLite export** — load library into a local SQLite file for ad-hoc SQL queries without loading everything into memory.
4. **Add Apple Music API backend last** — only if you need catalog metadata (artwork URLs, ISRC codes, genre taxonomy from Apple's catalog) or cross-device data not present in the local app.

The XML and JXA backends cover 95% of personal analysis workflows with no developer account or auth tokens required.
