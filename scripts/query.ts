#!/usr/bin/env tsx
import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import db from '../src/config/database'
import { runSync } from '../src/sync/syncService'

const program = new Command()
program.name('query').description('lamusica CLI — query and manage your Apple Music library database')

// ── sync ──────────────────────────────────────────────────────────────────────

program
  .command('sync <file>')
  .description('Run a sync against an XML export file')
  .option('--dry-run', 'Parse and validate without writing to the database')
  .action(async (file: string, opts: { dryRun?: boolean }) => {
    const filePath = path.resolve(file)
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`))
      process.exit(1)
    }

    if (opts.dryRun) {
      console.log(chalk.yellow('Dry-run mode: no changes will be written.'))
      const { parseLibraryFile } = await import('../src/parser/plistParser')
      const { validateSchema } = await import('../src/sync/schemaValidator')
      const library = parseLibraryFile(filePath)
      const warnings = validateSchema(library)
      const trackCount = Object.keys(library.Tracks).length
      const playlistCount = library.Playlists.length
      console.log(chalk.cyan(`\nParsed successfully:`))
      console.log(`  Tracks   : ${trackCount}`)
      console.log(`  Playlists: ${playlistCount}`)
      if (warnings.unknownTrackKeys.length) {
        console.log(chalk.yellow(`\nUnknown track keys: ${warnings.unknownTrackKeys.join(', ')}`))
      }
      if (warnings.unknownPlaylistKeys.length) {
        console.log(chalk.yellow(`Unknown playlist keys: ${warnings.unknownPlaylistKeys.join(', ')}`))
      }
      if (!warnings.unknownTrackKeys.length && !warnings.unknownPlaylistKeys.length) {
        console.log(chalk.green('\nNo schema warnings.'))
      }
      process.exit(0)
    }

    console.log(chalk.cyan(`\nSyncing ${path.basename(filePath)} ...`))
    try {
      const result = await runSync(filePath)
      console.log(chalk.green(`\nSync complete [${result.status}]`))
      console.log(`  Tracks   : +${result.tracks.added} added, ~${result.tracks.updated} updated, =${result.tracks.unchanged} unchanged`)
      console.log(`  Playlists: +${result.playlists.added} added, ~${result.playlists.updated} updated, =${result.playlists.unchanged} unchanged`)
      if (result.reportPath) console.log(`  Report   : ${result.reportPath}`)
      if (result.patchPath) console.log(chalk.yellow(`  Patch    : ${result.patchPath}`))
    } catch (err) {
      console.error(chalk.red('\nSync failed:'), err instanceof Error ? err.message : err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── tracks ────────────────────────────────────────────────────────────────────

program
  .command('tracks')
  .description('Query tracks')
  .option('--artist <name>', 'Filter by artist')
  .option('--album <name>', 'Filter by album')
  .option('--genre <name>', 'Filter by genre')
  .option('--search <term>', 'Search name/artist/album')
  .option('--loved', 'Only loved tracks')
  .option('--unplayed', 'Only tracks with no play count')
  .option('--sort <field:dir>', 'Sort e.g. play_count:desc', 'name:asc')
  .option('--limit <n>', 'Max rows', '20')
  .option('--format <fmt>', 'Output format: table|json|csv', 'table')
  .action(async (opts: {
    artist?: string; album?: string; genre?: string; search?: string
    loved?: boolean; unplayed?: boolean; sort: string; limit: string; format: string
  }) => {
    try {
      let query = db('tracks')
      if (opts.artist) query = query.where('artist', opts.artist)
      if (opts.album) query = query.where('album', opts.album)
      if (opts.genre) query = query.where('genre', opts.genre)
      if (opts.loved) query = query.where('loved', 1)
      if (opts.unplayed) query = query.whereNull('play_count').orWhere('play_count', 0)
      if (opts.search) {
        query = query.where((q) =>
          q.whereLike('name', `%${opts.search}%`)
            .orWhereLike('artist', `%${opts.search}%`)
            .orWhereLike('album', `%${opts.search}%`),
        )
      }
      const [sortField = 'name', sortDir = 'asc'] = opts.sort.split(':')
      query = query.orderBy(sortField, sortDir).limit(Number(opts.limit))

      const rows = await query
      printRows(rows, opts.format, ['name', 'artist', 'album', 'genre', 'play_count'])
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── playlists ─────────────────────────────────────────────────────────────────

program
  .command('playlists')
  .description('Query playlists')
  .option('--tree', 'Show folder hierarchy')
  .option('--format <fmt>', 'Output format: table|json', 'table')
  .action(async (opts: { tree?: boolean; format: string }) => {
    try {
      const rows = await db('playlists').orderBy('name')
      if (opts.tree) {
        printTree(rows)
      } else {
        printRows(rows, opts.format, ['name', 'persistent_id', 'smart', 'folder', 'master'])
      }
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── playlist-tracks ───────────────────────────────────────────────────────────

program
  .command('playlist-tracks <name>')
  .description('List tracks in a playlist by name')
  .option('--format <fmt>', 'Output format: table|json|csv', 'table')
  .action(async (name: string, opts: { format: string }) => {
    try {
      const playlist = await db('playlists').whereLike('name', `%${name}%`).first()
      if (!playlist) {
        console.error(chalk.red(`Playlist not found: ${name}`))
        process.exit(1)
      }
      console.log(chalk.cyan(`Playlist: ${playlist.name} (${playlist.persistent_id})`))
      const tracks = await db('tracks')
        .join('playlist_tracks', 'tracks.id', 'playlist_tracks.track_id')
        .where('playlist_tracks.playlist_id', playlist.id)
        .orderBy('playlist_tracks.position')
        .select('playlist_tracks.position', 'tracks.name', 'tracks.artist', 'tracks.album', 'tracks.total_time')
      printRows(tracks, opts.format, ['position', 'name', 'artist', 'album', 'total_time'])
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── sync-runs ─────────────────────────────────────────────────────────────────

program
  .command('sync-runs')
  .description('List sync run history')
  .option('--limit <n>', 'Max rows', '10')
  .action(async (opts: { limit: string }) => {
    try {
      const rows = await db('sync_runs').orderBy('started_at', 'desc').limit(Number(opts.limit))
      printRows(rows, 'table', ['id', 'source_file', 'status', 'tracks_added', 'tracks_updated', 'started_at'])
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── report ────────────────────────────────────────────────────────────────────

program
  .command('report <runId>')
  .description('Print the report for a specific sync run')
  .action(async (runId: string) => {
    try {
      const run = await db('sync_runs').where({ id: runId }).first()
      if (!run) {
        console.error(chalk.red(`Sync run not found: ${runId}`))
        process.exit(1)
      }
      if (!run.report_path) {
        console.error(chalk.yellow('No report available for this run.'))
        process.exit(0)
      }
      const reportPath = path.resolve(run.report_path)
      if (!fs.existsSync(reportPath)) {
        console.error(chalk.red(`Report file missing: ${reportPath}`))
        process.exit(1)
      }
      console.log(fs.readFileSync(reportPath, 'utf-8'))
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── patch ─────────────────────────────────────────────────────────────────────

program
  .command('patch <runId>')
  .description('Print the patch file for a specific sync run')
  .action(async (runId: string) => {
    try {
      const run = await db('sync_runs').where({ id: runId }).first()
      if (!run) {
        console.error(chalk.red(`Sync run not found: ${runId}`))
        process.exit(1)
      }
      if (!run.patch_path) {
        console.log(chalk.green('No patch file for this run (no unknown keys detected).'))
        process.exit(0)
      }
      const patchPath = path.resolve(run.patch_path)
      console.log(fs.readFileSync(patchPath, 'utf-8'))
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── stats ─────────────────────────────────────────────────────────────────────

program
  .command('stats')
  .description('Print aggregate library stats')
  .action(async () => {
    try {
      const [{ total: totalTracks }] = await db('tracks').count('* as total')
      const [{ total: totalPlaylists }] = await db('playlists').count('* as total')
      const [{ total: totalSyncs }] = await db('sync_runs').count('* as total')

      const [topArtist] = await db('tracks')
        .select('artist')
        .count('* as count')
        .whereNotNull('artist')
        .groupBy('artist')
        .orderBy('count', 'desc')
        .limit(1)

      const [{ total: totalPlaytime }] = await db('tracks').sum('total_time as total')

      const hours = Math.floor((Number(totalPlaytime) || 0) / 3600000)
      const minutes = Math.floor(((Number(totalPlaytime) || 0) % 3600000) / 60000)

      console.log(chalk.cyan('\n── Library Stats ──────────────────────'))
      console.log(`  Tracks         : ${totalTracks}`)
      console.log(`  Playlists      : ${totalPlaylists}`)
      console.log(`  Sync runs      : ${totalSyncs}`)
      console.log(`  Total playtime : ${hours}h ${minutes}m`)
      if (topArtist) console.log(`  Top artist     : ${topArtist.artist} (${topArtist.count} tracks)`)
      console.log('')
    } catch (err) {
      console.error(chalk.red('Error:'), err)
      process.exit(1)
    } finally {
      await db.destroy()
    }
  })

// ── schema-check ──────────────────────────────────────────────────────────────

program
  .command('schema-check <file>')
  .description('Validate a new export against the current schema without importing')
  .action(async (file: string) => {
    const filePath = path.resolve(file)
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`))
      process.exit(1)
    }
    const { parseLibraryFile } = await import('../src/parser/plistParser')
    const { validateSchema } = await import('../src/sync/schemaValidator')
    const library = parseLibraryFile(filePath)
    const warnings = validateSchema(library)

    if (!warnings.unknownTrackKeys.length && !warnings.unknownPlaylistKeys.length) {
      console.log(chalk.green('Schema OK — no unknown keys found.'))
    } else {
      if (warnings.unknownTrackKeys.length) {
        console.log(chalk.yellow(`Unknown track keys (${warnings.unknownTrackKeys.length}):`))
        for (const k of warnings.unknownTrackKeys) console.log(`  - ${k} (${warnings.affectedTrackIds[k].length} tracks)`)
      }
      if (warnings.unknownPlaylistKeys.length) {
        console.log(chalk.yellow(`Unknown playlist keys (${warnings.unknownPlaylistKeys.length}):`))
        for (const k of warnings.unknownPlaylistKeys) console.log(`  - ${k} (${warnings.affectedPlaylistIds[k].length} playlists)`)
      }
    }
    await db.destroy()
  })

// ── helpers ───────────────────────────────────────────────────────────────────

function printRows(rows: Record<string, unknown>[], format: string, cols: string[]) {
  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  if (format === 'csv') {
    console.log(cols.join(','))
    for (const row of rows) console.log(cols.map((c) => JSON.stringify(row[c] ?? '')).join(','))
    return
  }
  // table
  if (rows.length === 0) {
    console.log(chalk.dim('No results.'))
    return
  }
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)))
  const header = cols.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(chalk.bold(header))
  console.log(widths.map((w) => '─'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(cols.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  '))
  }
}

function printTree(playlists: Record<string, unknown>[]) {
  const byId = new Map(playlists.map((p) => [p.persistent_id, p]))
  const roots: Record<string, unknown>[] = []
  const children = new Map<string, Record<string, unknown>[]>()

  for (const p of playlists) {
    const parent = p.parent_persistent_id as string | null
    if (parent) {
      if (!children.has(parent)) children.set(parent, [])
      children.get(parent)!.push(p)
    } else {
      roots.push(p)
    }
  }

  function print(node: Record<string, unknown>, indent: number) {
    const prefix = '  '.repeat(indent)
    const flags = [
      node.smart ? '[smart]' : '',
      node.folder ? '[folder]' : '',
      node.master ? '[master]' : '',
    ].filter(Boolean).join(' ')
    console.log(`${prefix}${chalk.cyan(String(node.name))} ${chalk.dim(flags)}`)
    for (const child of children.get(node.persistent_id as string) ?? []) {
      print(child, indent + 1)
    }
  }

  for (const root of roots) print(root, 0)
  void byId // suppress unused warning
}

program.parse(process.argv)
