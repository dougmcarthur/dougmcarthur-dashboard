import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './types'
import overview from './routes/overview'
import gigs from './routes/gigs'
import sync from './routes/sync'
import promo from './routes/promo'
import reference from './routes/reference'
import taskRuns from './routes/taskRuns'
import reminders from './routes/reminders'
import health from './routes/health'
import syncReconcile from './routes/syncReconcile'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', logger())
app.use('/api/*', cors())

app.route('/api/overview', overview)
app.route('/api/gigs', gigs)
// NOTE: must be registered before '/api/sync' — otherwise the sync router's
// GET '/:id' route matches '/reconcile' first and swallows this endpoint.
app.route('/api/sync/reconcile', syncReconcile)
app.route('/api/sync', sync)
app.route('/api/promo', promo)
app.route('/api/reference-docs', reference)
app.route('/api/task-runs', taskRuns)
app.route('/api/reminders', reminders)
app.route('/api/health', health)

app.notFound((c) => c.json({ error: 'not found' }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

// Fall through to static assets for non-API routes
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
