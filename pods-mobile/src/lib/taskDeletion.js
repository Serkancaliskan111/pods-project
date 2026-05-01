/** roller.yetkiler: iş silme talebi / onayı (Supabase RPC ile uyumlu) */

export function canRequestTaskDeletion(permissions) {
  const v = permissions?.['is.sil']
  return v === true || v === 'true' || v === 1 || v === '1'
}

export function canApproveTaskDeletion(permissions) {
  const v = permissions?.['is.sil.onay']
  return v === true || v === 'true' || v === 1 || v === '1'
}
