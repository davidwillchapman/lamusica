# lamusica

Apple Music Library Analyzer

## Overview

lamusica is a tool for analyzing and syncing your Apple Music library. It parses your Apple Music Library XML file, stores the data in a SQLite database, and provides an Express API to query tracks, playlists, and sync history.

## Setup

### Prerequisites

- Node.js 18+ (with npm or yarn)
- An Apple Music Library XML file (exported from Apple Music app)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd lamusica
```

2. Install dependencies:

```bash
npm install
```

3. Build TypeScript:

```bash
npm run build
```

## Database Setup

### Initialize the Database

The application uses SQLite with Knex.js for migrations. The database file (`lamusica.db`) is created automatically in the project root.

Run migrations to set up the database schema:

```bash
npm run migrate
```

This creates the following tables:

- **sync_runs**: Tracks each import/sync operation with metadata and results
- **tracks**: Stores individual track information from your library
- **playlists**: Stores playlist information
- **playlist_tracks**: Junction table linking tracks to playlists

### Database Location

- Development: `./lamusica.db` (project root)
- Schema: `src/db/migrations/` (TypeScript migration files)

## Usage

### Syncing Your Apple Music Library

To import your Apple Music library:

```bash
npm run sync -- <path-to-library-file.xml>
```

Example:

```bash
npm run sync -- ~/Music/Music\ Library.xml
```

This will:

1. Parse the XML library file
2. Validate the schema
3. Import/update tracks and playlists in the database
4. Generate a sync report
5. Create a patch file with detailed changes

### Starting the API Server

Start the Express API server (default port: 3000):

```bash
npm run serve
```

The server will listen at `http://localhost:3000` and expose these endpoints:

- `GET /api/tracks` - List all tracks
- `GET /api/playlists` - List all playlists
- `GET /api/sync-runs` - View sync operation history
- `POST /api/sync` - Trigger a new sync operation

### Querying the Database

For advanced queries, use the query script:

```bash
npm run query
```

## Development

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Database Migrations

Create a new migration:

```bash
npx knex migrate:make --knexfile knexfile.ts <migration-name>
```

Rollback the last migration:

```bash
npm run migrate:rollback
```

## Project Structure

```
src/
├── api/           # Express server and routes
├── config/        # Database configuration
├── db/
│   └── migrations/ # Knex migration files
├── parser/        # Apple Music XML parser
├── sync/          # Core sync logic (tracks, playlists)
├── types/         # TypeScript type definitions
└── patches/       # Patch generation for sync results
```

## Configuration

Database configuration is defined in `knexfile.ts` and uses environment-specific settings:

- Client: SQLite (better-sqlite3)
- Database file: `./lamusica.db`
- Migrations directory: `src/db/migrations`
