import type { ErrorRequestHandler } from 'express'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  const status = (err as { status?: number }).status ?? 500
  res.status(status).json({ error: err instanceof Error ? err.message : String(err) })
}
