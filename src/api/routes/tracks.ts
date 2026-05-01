import { Router } from 'express'
import db from '../../config/database'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const {
      artist, album, genre, search,
      loved, explicit: exp, compilation,
      sort = 'name:asc',
      limit = '50', offset = '0',
    } = req.query as Record<string, string | undefined>

    let query = db('tracks')

    if (artist) query = query.where('artist', artist)
    if (album) query = query.where('album', album)
    if (genre) query = query.where('genre', genre)
    if (loved === 'true') query = query.where('loved', 1)
    if (exp === 'true') query = query.where('explicit', 1)
    if (compilation === 'true') query = query.where('compilation', 1)

    if (search) {
      query = query.where((q) =>
        q
          .whereLike('name', `%${search}%`)
          .orWhereLike('artist', `%${search}%`)
          .orWhereLike('album', `%${search}%`),
      )
    }

    const [sortField = 'name', sortDir = 'asc'] = sort.split(':')
    const direction = sortDir.toLowerCase() === 'desc' ? 'desc' : 'asc'
    query = query.orderBy(sortField, direction)

    query = query.limit(Number(limit)).offset(Number(offset))

    const tracks = await query
    res.json(tracks)
  } catch (err) {
    next(err)
  }
})

router.get('/:persistentId', async (req, res, next) => {
  try {
    const track = await db('tracks').where({ persistent_id: req.params.persistentId }).first()
    if (!track) return res.status(404).json({ error: 'Track not found' })
    res.json(track)
  } catch (err) {
    next(err)
  }
})

export default router
