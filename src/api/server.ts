import express from 'express'
import { errorHandler } from './middleware/errorHandler'
import tracksRouter from './routes/tracks'
import playlistsRouter from './routes/playlists'
import syncRunsRouter from './routes/syncRuns'

const app = express()
app.use(express.json())

app.use('/api/tracks', tracksRouter)
app.use('/api/playlists', playlistsRouter)
app.use('/api/sync-runs', syncRunsRouter)
app.post('/api/sync', syncRunsRouter)

app.use(errorHandler)

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
app.listen(PORT, () => {
  console.log(`lamusica API listening on http://localhost:${PORT}`)
})

export default app
