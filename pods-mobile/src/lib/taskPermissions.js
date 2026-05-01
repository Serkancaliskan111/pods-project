import { isPermTruthy } from './managementScope'

/** Görev onayı (liste/detay ile uyumlu) */
export function canApproveTask(permissions) {
  return (
    isPermTruthy(permissions, 'gorev_onayla') ||
    isPermTruthy(permissions, 'denetim.onayla')
  )
}

/** rpc_is_operasyonel_guncelle — rol: is.duzenle */
export function canOperationallyEditAssignedTask(permissions, isSystemAdmin) {
  if (isSystemAdmin) return true
  return isPermTruthy(permissions, 'is.duzenle')
}
