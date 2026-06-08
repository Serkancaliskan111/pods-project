import { useEffect, useMemo, useState } from 'react'
import {
  CHAIN_STEP_MODES,
  GOREV_MODU_MODE_ICONS,
} from '../lib/gorevModuOptions.js'
import {
  Clock3,
  FileText,
  FolderOpen,
  Layers2,
  LayoutGrid,
  ListOrdered,
  Repeat,
  SlidersHorizontal,
  Users,
} from 'lucide-react-native'

/**
 * Web TaskAssignForm embedded adım dizisi (modal parity).
 */
export function useTaskAssignEmbeddedSteps(gorevModu) {
  const [embeddedStepIndex, setEmbeddedStepIndex] = useState(0)

  const needsStepsTab = CHAIN_STEP_MODES.has(gorevModu)
  const needsFilesTab = gorevModu !== 'sirali_gorev'

  const turIcon = useMemo(() => {
    if (gorevModu && GOREV_MODU_MODE_ICONS[gorevModu]) return GOREV_MODU_MODE_ICONS[gorevModu]
    return Layers2
  }, [gorevModu])

  const embeddedSteps = useMemo(() => {
    const list = [
      { id: 'tur', label: 'Tür', icon: turIcon },
      { id: 'detaylar-temel', label: 'Bilgi', icon: FileText },
      { id: 'detaylar-atama', label: 'Atama', icon: Users },
    ]
    if (needsFilesTab) list.push({ id: 'dosyalar', label: 'Dosyalar', icon: FolderOpen })
    if (needsStepsTab) list.push({ id: 'adimlar', label: 'Adımlar', icon: ListOrdered })
    if (gorevModu !== 'sirali_gorev') {
      list.push({ id: 'zamanlama', label: 'Zamanlama', icon: Clock3 })
    }
    list.push({ id: 'tekrarlama', label: 'Tekrarlama', icon: Repeat })
    list.push({ id: 'diger', label: 'Diğer', icon: SlidersHorizontal })
    return list
  }, [needsFilesTab, needsStepsTab, gorevModu, turIcon])

  useEffect(() => {
    setEmbeddedStepIndex(0)
  }, [gorevModu])

  useEffect(() => {
    if (embeddedStepIndex >= embeddedSteps.length) {
      setEmbeddedStepIndex(Math.max(0, embeddedSteps.length - 1))
    }
  }, [embeddedSteps.length, embeddedStepIndex])

  const currentEmbeddedStep = embeddedSteps[embeddedStepIndex] || embeddedSteps[0]
  const embeddedStepId = currentEmbeddedStep?.id || 'tur'
  const isLastEmbeddedStep = embeddedStepIndex >= embeddedSteps.length - 1

  const goEmbeddedNext = () => {
    setEmbeddedStepIndex((i) => Math.min(embeddedSteps.length - 1, i + 1))
  }

  const goEmbeddedPrev = () => {
    setEmbeddedStepIndex((i) => Math.max(0, i - 1))
  }

  const goEmbeddedTo = (idx) => {
    if (idx >= 0 && idx < embeddedSteps.length) setEmbeddedStepIndex(idx)
  }

  return {
    embeddedSteps,
    embeddedStepIndex,
    embeddedStepId,
    isLastEmbeddedStep,
    needsStepsTab,
    needsFilesTab,
    goEmbeddedNext,
    goEmbeddedPrev,
    goEmbeddedTo,
    setEmbeddedStepIndex,
  }
}

export function resolveEmbeddedStepIcon(IconComponent) {
  return IconComponent || Layers2
}
