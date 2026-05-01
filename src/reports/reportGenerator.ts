import fs from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import type { RawLibrary } from '../parser/types'
import type { SyncResult } from '../types'

export async function generateReport(
  syncRunId: number,
  result: SyncResult,
  _library: RawLibrary,
): Promise<string> {
  const timestamp = dayjs().format('YYYYMMDD-HHmmss')
  const reportDir = path.resolve('reports')
  fs.mkdirSync(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, `${timestamp}-sync.md`)

  const lines: string[] = []

  lines.push(`# Sync Report — ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`)
  lines.push('')

  lines.push('## Run Details')
  lines.push('```json')
  lines.push(
    JSON.stringify(
      {
        syncRunId: result.syncRunId,
        sourceFile: result.sourceFile,
        status: result.status,
        timestamp: dayjs().toISOString(),
      },
      null,
      2,
    ),
  )
  lines.push('```')
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Count |')
  lines.push('|---|---|')
  lines.push(`| Tracks added | ${result.tracks.added} |`)
  lines.push(`| Tracks updated | ${result.tracks.updated} |`)
  lines.push(`| Tracks unchanged | ${result.tracks.unchanged} |`)
  lines.push(`| Playlists added | ${result.playlists.added} |`)
  lines.push(`| Playlists updated | ${result.playlists.updated} |`)
  lines.push(`| Playlists unchanged | ${result.playlists.unchanged} |`)
  lines.push('')

  // Track changes
  lines.push('## Track Changes')
  lines.push('')
  lines.push('### Added Tracks')
  if (result.tracks.addedItems.length === 0) {
    lines.push('_None_')
  } else {
    lines.push('```json')
    lines.push(JSON.stringify(result.tracks.addedItems.slice(0, 50), null, 2))
    lines.push('```')
    if (result.tracks.addedItems.length > 50) {
      lines.push(`_... and ${result.tracks.addedItems.length - 50} more_`)
    }
  }
  lines.push('')

  lines.push('### Updated Tracks')
  if (result.tracks.updatedItems.length === 0) {
    lines.push('_None_')
  } else {
    lines.push('```json')
    lines.push(JSON.stringify(result.tracks.updatedItems.slice(0, 50), null, 2))
    lines.push('```')
    if (result.tracks.updatedItems.length > 50) {
      lines.push(`_... and ${result.tracks.updatedItems.length - 50} more_`)
    }
  }
  lines.push('')

  // Playlist changes
  lines.push('## Playlist Changes')
  lines.push('')
  lines.push('### Added Playlists')
  if (result.playlists.addedItems.length === 0) {
    lines.push('_None_')
  } else {
    lines.push('```json')
    lines.push(JSON.stringify(result.playlists.addedItems, null, 2))
    lines.push('```')
  }
  lines.push('')

  lines.push('### Updated Playlists')
  if (result.playlists.updatedItems.length === 0) {
    lines.push('_None_')
  } else {
    lines.push('```json')
    lines.push(JSON.stringify(result.playlists.updatedItems, null, 2))
    lines.push('```')
  }
  lines.push('')

  // Schema warnings
  const hasWarnings =
    result.unknownTrackKeys.length > 0 || result.unknownPlaylistKeys.length > 0

  if (hasWarnings) {
    lines.push('## Schema Warnings')
    lines.push('')
    lines.push(
      `> **Action required:** Unknown keys were detected. A patch file has been written to \`${result.patchPath}\`.`,
    )
    lines.push('')

    if (result.unknownTrackKeys.length > 0) {
      lines.push('### Unknown Track Keys')
      for (const key of result.unknownTrackKeys) {
        lines.push(`- \`${key}\``)
      }
      lines.push('')
    }

    if (result.unknownPlaylistKeys.length > 0) {
      lines.push('### Unknown Playlist Keys')
      for (const key of result.unknownPlaylistKeys) {
        lines.push(`- \`${key}\``)
      }
      lines.push('')
    }

    if (result.patchPath) {
      lines.push('## Patch File')
      lines.push(`\`${result.patchPath}\``)
      lines.push('')
    }
  }

  // Data integrity checks
  lines.push('## Data Integrity')
  lines.push('')
  lines.push('_Integrity checks are run post-sync. See sync run record for details._')
  lines.push('')

  fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8')

  return `reports/${timestamp}-sync.md`
}
