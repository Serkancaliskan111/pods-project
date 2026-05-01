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
    if (error) throw error
  } catch (_) {
    // best-effort; mobil ile aynı — zaman çizelgesi kritik değilse sessiz
  }
}

