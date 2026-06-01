import { FileStack, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState, Sheet } from '../../../ui'

export default function PersonalTodoTemplatesSheet({
  open,
  onClose,
  templates,
  onNew,
  onEdit,
  onUse,
  onDelete,
}) {
  return (
    <Sheet open={open} onClose={onClose} side="right" title="Şablonlarım" className="px-5 pb-8 pt-2">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Sık kullandığınız kontrol listelerini şablon olarak kaydedin; tek tıkla yeni liste açın.
        </p>
        <Button variant="primary" size="sm" iconLeft={<Plus size={16} />} onClick={onNew} fullWidth>
          Yeni şablon
        </Button>
        {templates.length === 0 ? (
          <EmptyState
            className="py-10"
            title="Henüz şablon yok"
            description="İlk şablonunuzu oluşturun; sonra listelerinizi hızlıca başlatın."
            icon={<FileStack size={40} strokeWidth={1.25} className="mx-auto text-slate-300" />}
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50/50">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{t.baslik}</p>
                  {t.aciklama ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.aciklama}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button variant="primary" size="sm" onClick={() => onUse(t.id)}>
                    Listeyi aç
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Pencil size={14} />}
                    onClick={() => onEdit(t.id)}
                  >
                    Düzenle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<Trash2 size={14} />}
                    onClick={() => onDelete(t)}
                    aria-label="Şablonu sil"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
