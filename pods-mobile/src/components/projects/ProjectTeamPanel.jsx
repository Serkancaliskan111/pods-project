import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import ProjectTeamBulkPicker from './ProjectTeamBulkPicker'
import {
  addProjectMembers,
  fetchProjectTeamMembers,
  fetchStaffPoolForProject,
  personToPickerOption,
  removeProjectMember,
} from '../../lib/projectApi'

/**
 * Proje sorumluları — web ProjectTeamPanel mobil karşılığı.
 */
export default function ProjectTeamPanel({ projectId, scopeCtx, readOnly = false, onTeamChange }) {
  const [members, setMembers] = useState([])
  const [poolOptions, setPoolOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const list = await fetchProjectTeamMembers(projectId)
      setMembers(list)
      onTeamChange?.(list)
    } catch (e) {
      if (__DEV__) console.warn('ProjectTeamPanel', e)
      Alert.alert('Hata', e?.message || 'Ekip yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [projectId, onTeamChange])

  useEffect(() => {
    void load()
  }, [load])

  const memberIds = useMemo(() => members.map((m) => m.personel_id), [members])

  useEffect(() => {
    if (!projectId || readOnly) return
    let cancelled = false
    void fetchStaffPoolForProject(projectId, scopeCtx)
      .then((pool) => {
        if (!cancelled) {
          setPoolOptions(pool.map((p) => personToPickerOption(p)).filter(Boolean))
        }
      })
      .catch(() => {
        if (!cancelled) setPoolOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId, scopeCtx, memberIds.length, readOnly])

  const allOptions = useMemo(() => {
    const byId = new Map(poolOptions.map((o) => [String(o.id), o]))
    for (const m of members) {
      const key = String(m.personel_id)
      if (!byId.has(key)) {
        byId.set(key, {
          id: m.personel_id,
          name: [m.ad, m.soyad].filter(Boolean).join(' ').trim() || m.email || 'Personel',
        })
      }
    }
    return [...byId.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'tr'),
    )
  }, [poolOptions, members])

  const handleBulkChange = async (nextIds) => {
    if (readOnly) return
    const prev = new Set(memberIds.map(String))
    const next = new Set(nextIds.map(String))
    const toAdd = [...next].filter((id) => !prev.has(id))
    const toRemove = [...prev].filter((id) => !next.has(id))
    if (!toAdd.length && !toRemove.length) return

    setSaving(true)
    try {
      for (const id of toRemove) {
        await removeProjectMember(projectId, id)
      }
      if (toAdd.length) {
        await addProjectMembers(projectId, toAdd)
      }
      await load()
    } catch (e) {
      Alert.alert('Hata', e?.message || 'Ekip güncellenemedi')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProjectTeamBulkPicker
      selectedIds={memberIds}
      options={allOptions}
      onChange={readOnly ? undefined : handleBulkChange}
      readOnly={readOnly}
      loading={loading}
      saving={saving}
      emptyText="Henüz proje sorumlusu yok. «Ekip seç» ile personel ekleyin."
    />
  )
}
