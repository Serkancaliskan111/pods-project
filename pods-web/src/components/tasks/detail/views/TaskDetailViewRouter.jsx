import { getTaskDetailDesign } from '../taskDetailDesign.js'
import NormalTaskDetailView from './NormalTaskDetailView.jsx'
import SablonTaskDetailView from './SablonTaskDetailView.jsx'
import ZincirGorevTaskDetailView from './ZincirGorevTaskDetailView.jsx'
import ZincirOnayTaskDetailView from './ZincirOnayTaskDetailView.jsx'
import ZincirHybridTaskDetailView from './ZincirHybridTaskDetailView.jsx'
import SiraliTaskDetailView from './SiraliTaskDetailView.jsx'

const VIEWS = {
  normal: NormalTaskDetailView,
  sablon_gorev: SablonTaskDetailView,
  zincir_gorev: ZincirGorevTaskDetailView,
  zincir_onay: ZincirOnayTaskDetailView,
  zincir_gorev_ve_onay: ZincirHybridTaskDetailView,
  sirali_gorev: SiraliTaskDetailView,
}

export default function TaskDetailViewRouter({ ctx }) {
  const key = String(ctx.task?.gorev_turu || 'normal').trim() || 'normal'
  const View = VIEWS[key] || NormalTaskDetailView
  const design = getTaskDetailDesign(key)
  return <View ctx={{ ...ctx, design }} />
}
