/**
 * Google Tasks, for the half of what Scout nudges about that is work rather
 * than an appointment. See `shared/nudgeRouting.ts` for which half.
 *
 * **The scope is wider than this app's habit, and there is no narrow one.**
 * Google offers exactly two: `tasks.readonly`, which cannot write, and
 * `tasks`, which is read and write over *every* list in the account. There is
 * no `tasks.app.created` — the structural guarantee the calendar grant enjoys
 * simply does not exist here.
 *
 * So this is the `gmail.compose` situation rather than the
 * `calendar.app.created` one, and it is handled the same way: the limit stops
 * being enforced by Google and starts being enforced by this file. Scout makes
 * one list, called Sun Dogs Music Scout, stores its id on the grant, and every
 * call below takes that id as an argument. There is no list-enumerating call
 * in here, nothing reads a task Scout did not write, and `taskListId` is the
 * only way to name a list. The connect screen says so in as many words,
 * because a permission that protects less than the reader assumes is the kind
 * of thing to write down rather than imply.
 *
 * Two things about the API that are not obvious:
 *
 * - **`due` is a timestamp and Google throws the time away.** The field is
 *   RFC 3339 and the docs say so, but the service records only the date part —
 *   you cannot set a due *hour*. So the callers here pass a date and this
 *   file appends the zero hour, rather than letting each one invent its own
 *   way of pretending to a precision that does not survive the round trip.
 * - **A completed task is not gone.** Ticking one off leaves the row with
 *   `status: completed`, and it stays in the list. The reconcile has to read
 *   that rather than assume a task it cannot find was never made.
 */

export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'

const BASE = 'https://tasks.googleapis.com/tasks/v1'

/** Where a task is going, and what may write it. Mirrors `CalendarTarget`. */
export interface TasksTarget {
  accessToken: string
  taskListId: string
}

export interface TaskInput {
  title: string
  notes?: string
  /** ISO date, `YYYY-MM-DD`. The time is discarded by Google either way. */
  due: string
}

export interface TaskRef {
  id: string
  /** `needsAction` or `completed`, verbatim from Google. */
  status: string
}

/** Google wants a full timestamp and keeps only the day. See the note above. */
function dueStamp(date: string): string {
  return `${date}T00:00:00.000Z`
}

async function call<T>(
  target: TasksTarget,
  path: string,
  init: RequestInit & { method: string },
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${target.accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`Google Tasks ${init.method} ${path} failed: ${res.status} ${await res.text()}`)
  return res.status === 204 ? (undefined as T) : res.json<T>()
}

/**
 * Make the list Scout writes to.
 *
 * Part of connecting rather than something the first nudge discovers it
 * needs — the same reason a calendar grant creates its calendar at consent
 * time. A grant with no list id is a grant that cannot write anything, and
 * finding that out at consent beats finding it out mid-reconcile.
 */
export async function createScoutTaskList(accessToken: string, title: string): Promise<string> {
  const res = await fetch(`${BASE}/users/@me/lists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error(`Task list create failed: ${await res.text()}`)
  return (await res.json<{ id: string }>()).id
}

export async function createTaskOn(target: TasksTarget, input: TaskInput): Promise<TaskRef> {
  return call<TaskRef>(target, `/lists/${encodeURIComponent(target.taskListId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: input.title, notes: input.notes ?? '', due: dueStamp(input.due) }),
  })
}

export async function updateTaskOn(
  target: TasksTarget,
  taskId: string,
  input: Partial<TaskInput>,
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (input.title) body.title = input.title
  if (input.notes !== undefined) body.notes = input.notes
  if (input.due) body.due = dueStamp(input.due)
  await call<void>(target, `/lists/${encodeURIComponent(target.taskListId)}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/** Reads one task, so a reconcile can tell "ticked off" from "deleted". */
export async function readTaskOn(target: TasksTarget, taskId: string): Promise<TaskRef | null> {
  const res = await fetch(
    `${BASE}/lists/${encodeURIComponent(target.taskListId)}/tasks/${taskId}`,
    { headers: { Authorization: `Bearer ${target.accessToken}` } },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Google Tasks read failed: ${res.status} ${await res.text()}`)
  return res.json<TaskRef>()
}

export async function deleteTaskOn(target: TasksTarget, taskId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/lists/${encodeURIComponent(target.taskListId)}/tasks/${taskId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${target.accessToken}` } },
  )
  // 404 = already gone, 204 = success. Both mean what the caller wanted.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Google Tasks delete failed: ${res.status} ${await res.text()}`)
  }
}
