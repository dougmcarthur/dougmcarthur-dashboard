import { Hono } from 'hono'
import { runScheduledTasks } from '../scheduled'
import type { Env } from '../types'

const tasks = new Hono<{ Bindings: Env }>()

// Runs the same work as the daily cron, on demand. Useful for testing the
// pipeline and for "do it now" after editing a window date.
tasks.post('/run', async (c) => {
  const summary = await runScheduledTasks(c.env)
  return c.json(summary)
})

export default tasks
