import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Pencil } from 'lucide-react-native'
import ProjectTeamBulkPicker from './ProjectTeamBulkPicker'
import { personToPickerOption } from '../../lib/projectApi'
import { Text, Button, EmptyState, palette, spacing } from '../../ui'

/**
 * Proje detay — ekip sekmesi: üye listesi ve düzenleme kısayolu.
 */
export default function ProjectTeamCompactSection({
  teamMembers = [],
  authorizedMembers = [],
  mayManage = false,
  onEditPress,
}) {
  const allMembers = useMemo(() => {
    const seen = new Set()
    const rows = []
    for (const m of authorizedMembers) {
      const id = m.personel_id
      if (seen.has(String(id))) continue
      seen.add(String(id))
      rows.push({ ...m, _role: 'yetkili' })
    }
    for (const m of teamMembers) {
      const id = m.personel_id
      if (seen.has(String(id))) continue
      seen.add(String(id))
      rows.push({ ...m, _role: 'uye' })
    }
    return rows
  }, [teamMembers, authorizedMembers])

  const options = useMemo(
    () => allMembers.map((m) => personToPickerOption(m)).filter(Boolean),
    [allMembers],
  )

  const selectedIds = allMembers.map((m) => m.personel_id)

  if (allMembers.length === 0) {
    return (
      <EmptyState
        title="Ekip üyesi yok"
        description={
          mayManage
            ? 'Proje düzenleme ekranından ekip ekleyebilirsiniz.'
            : 'Bu projede henüz ekip tanımlanmamış.'
        }
        action={
          mayManage ? (
            <Button variant="primary" size="sm" onPress={onEditPress} iconLeft={<Pencil size={14} color="#fff" />}>
              Ekip düzenle
            </Button>
          ) : null
        }
      />
    )
  }

  return (
    <View style={styles.wrap}>
      <Text variant="bodyMd" weight="Bold" color={palette.slate[800]}>
        Proje ekibi
      </Text>
      <Text variant="caption" color={palette.slate[500]} style={{ marginBottom: spacing.sm }}>
        Görev atamasında kullanılan {allMembers.length} kişi
      </Text>

      <ProjectTeamBulkPicker
        title="Üyeler"
        subtitle="Detay için dokunun"
        selectedIds={selectedIds}
        options={options}
        readOnly
        emptyText="Ekip üyesi yok"
      />

      {mayManage ? (
        <Button
          variant="outline"
          size="sm"
          onPress={onEditPress}
          iconLeft={<Pencil size={14} color={palette.primary[700]} />}
          style={{ marginTop: spacing.md }}
        >
          Ekip düzenle
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
})
