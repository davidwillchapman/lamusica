import { Router } from 'express'
import db from '../../config/database'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const playlists = await db('playlists').orderBy('name')
    res.json(playlists)
  } catch (err) {
    next(err)
  }
})

router.get('/:persistentId', async (req, res, next) => {
  try {
    const playlist = await db('playlists').where({ persistent_id: req.params.persistentId }).first()
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' })

    const tracks = await db('tracks')
      .join('playlist_tracks', 'tracks.id', 'playlist_tracks.track_id')
      .where('playlist_tracks.playlist_id', playlist.id)
      .orderBy('playlist_tracks.position')
      .select('tracks.*', 'playlist_tracks.position')

    res.json({ ...playlist, tracks })
  } catch (err) {
    next(err)
  }
})

router.get('/:persistentId/tracks', async (req, res, next) => {
  try {
    const playlist = await db('playlists').where({ persistent_id: req.params.persistentId }).first()
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' })

    const tracks = await db('tracks')
      .join('playlist_tracks', 'tracks.id', 'playlist_tracks.track_id')
      .where('playlist_tracks.playlist_id', playlist.id)
      .orderBy('playlist_tracks.position')
      .select('tracks.*', 'playlist_tracks.position')

    res.json(tracks)
  } catch (err) {
    next(err)
  }
})

export default router
