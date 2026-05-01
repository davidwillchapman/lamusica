import path from 'path'
import dayjs from 'dayjs'
import db from '../config/database'
import { parseLibraryFile } from '../parser/plistParser'
import { validateSchema } from './schemaValidator'
import { syncTracks } from './trackSync'
import { syncPlaylists } from './playlistSync'
import { generateReport } from '../reports/reportGenerator'
import { generatePatch } from '../patches/patchGenerator'
import type { SyncResult } from '../types'

export async function runSync(filePath: string): Promise<SyncResult> {
  const sourceFile = path.basename(filePath)
  const startedAt = dayjs().toISOString()

  const [runId] = await db('sync_runs').insert({
    source_file: sourceFile,
    started_at: startedAt,
    status: 'running',
  }) as unknown as number[]

  const syncRunId = typeof runId === 'object' ? (runId as { id: number }).id : runId

  try {
    const library = parseLibraryFile(filePath)
    const warnings = validateSchema(library)

    const trackResult = await syncTracks(db, library.Tracks)
    const playlistResult = await syncPlaylists(db, library.Playlists)

    const hasWarnings =
      warnings.unknownTrackKeys.length > 0 || warnings.unknownPlaylistKeys.length > 0
    const status = hasWarnings ? 'partial' : 'success'

    const result: SyncResult = {
      syncRunId,
      sourceFile,
      status,
      tracks: trackResult,
      playlists: playlistResult,
      unknownTrackKeys: warnings.unknownTrackKeys,
      unknownPlaylistKeys: warnings.unknownPlaylistKeys,
    }

    const reportPath = await generateReport(syncRunId, result, library)
    result.reportPath = reportPath

    let patchPath: string | undefined
    if (hasWarnings) {
      patchPath = await generatePatch(syncRunId, warnings, library)
      result.patchPath = patchPath
    }

    await db('sync_runs').where({ id: syncRunId }).update({
      completed_at: dayjs().toISOString(),
      status,
      tracks_added: trackResult.added,
      tracks_updated: trackResult.updated,
      tracks_unchanged: trackResult.unchanged,
      playlists_added: playlistResult.added,
      playlists_updated: playlistResult.updated,
      playlists_unchanged: playlistResult.unchanged,
      unknown_track_keys: warnings.unknownTrackKeys.length
        ? JSON.stringify(warnings.unknownTrackKeys)
        : null,
      unknown_playlist_keys: warnings.unknownPlaylistKeys.length
        ? JSON.stringify(warnings.unknownPlaylistKeys)
        : null,
      report_path: reportPath,
      patch_path: patchPath ?? null,
    })

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db('sync_runs').where({ id: syncRunId }).update({
      completed_at: dayjs().toISOString(),
      status: 'failed',
      error_message: message,
    })
    throw err
  }
}
