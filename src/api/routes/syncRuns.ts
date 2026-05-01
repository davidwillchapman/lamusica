import { Router } from 'express'
import db from '../../config/database'
import { runSync } from '../../sync/syncService'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { limit = '20', offset = '0' } = req.query as Record<string, string>
    const runs = await db('sync_runs')
      .orderBy('started_at', 'desc')
      .limit(Number(limit))
      .offset(Number(offset))
    res.json(runs)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const run = await db('sync_runs').where({ id: req.params.id }).first()
    if (!run) return res.status(404).json({ error: 'Sync run not found' })
    res.json(run)
  } catch (err) {
    next(err)
  }
})

router.post('/sync', async (req, res, next) => {
  try {
    const { filePath } = req.body as { filePath?: string }
    if (!filePath) return res.status(400).json({ error: 'filePath is required' })
    const result = await runSync(filePath)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
