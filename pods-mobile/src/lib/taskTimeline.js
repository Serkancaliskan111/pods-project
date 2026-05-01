import getSupabase from './supabaseClient'

const supabase = getSupabase()

export async function logTaskTimelineEvent(taskId, eventType, actorId, note = null) {
  if (!taskId || !eventType) return
  try {
    const { error } = await supabase.rpc('log_task_timeline_event', {
      p_task_id: taskId,
      p_event: eventType,
      p_actor_id: actorId || null,
      p_note: note || null,
      p_at: new Date().toISOString(),
    })
    if (error) {
      if (__DEV__) console.warn('[taskTimeline] log_task_timeline_event:', error.message || error)
      throw error
    }
  } catch (e) {
    if (__DEV__) console.warn('[taskTimeline]', e?.message || e)
  }
}

