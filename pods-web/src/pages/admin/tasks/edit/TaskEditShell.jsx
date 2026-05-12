import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  Pencil,
} from 'lucide-react'
import Spinner from '../../../../components/ui/Spinner.jsx'

/**
 * Görev düzenleme ekranlarının ortak çerçevesi.
 *
 * - Üstte breadcrumb hissi veren "Görevler › Düzenle" navigasyonu
 * - Beyaz hero başlık + ikon + badge
 * - Yükleme / engellenmiş (blockedReason) durumlarını uniform gösterir
 */
export default function TaskEditShell({
  loading,
  taskId,
  title,
  subtitle,
  blockedReason,
  badge,
  children,
}) {
  const navigate = useNavigate()
  return (
    <div
      style={{
        padding: '20px 28px 60px',
        background:
          'linear-gradient(180deg, #f1f5f9 0%, #f8fafc 240px, #f8fafc 100%)',
        minHeight: '100%',
      }}
    >
      <nav
        aria-label="Breadcrumb"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: '#64748b',
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/admin/tasks')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            border: '1px solid #e2e8f0',
            borderRadius: 9999,
            backgroundColor: '#fff',
            fontSize: 12,
            color: '#475569',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={12} strokeWidth={2.4} /> Görevler
        </button>
        <ChevronRight size={12} strokeWidth={2.4} style={{ color: '#cbd5e1' }} />
        <button
          type="button"
          onClick={() =>
            navigate(taskId ? `/admin/tasks/${taskId}` : '/admin/tasks')
          }
          style={{
            padding: '4px 8px',
            borderRadius: 9999,
            backgroundColor: 'transparent',
            border: 'none',
            color: '#475569',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Görev detayı
        </button>
        <ChevronRight size={12} strokeWidth={2.4} style={{ color: '#cbd5e1' }} />
        <span style={{ color: '#0f172a', fontWeight: 700 }}>Düzenle</span>
      </nav>

      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <header
          style={{
            position: 'relative',
            padding: '20px 22px',
            borderRadius: 20,
            border: '1px solid #dbe5f0',
            background:
              'linear-gradient(135deg, #ffffff 0%, #f8fbff 60%, #eef2ff 140%)',
            boxShadow: '0 24px 50px -36px rgba(15,23,42,0.45)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg,#6366f1 0%, #4f46e5 100%)',
                color: '#fff',
                boxShadow: '0 12px 24px -12px rgba(79,70,229,0.65)',
              }}
            >
              <Pencil size={20} strokeWidth={2.2} />
            </span>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '-0.01em',
                }}
              >
                {title || 'Görevi düzenle'}
              </h1>
              {subtitle ? (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 12.5,
                    color: '#475569',
                    lineHeight: 1.55,
                    maxWidth: 720,
                  }}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
            {badge ? (
              <span
                style={{
                  padding: '5px 12px',
                  borderRadius: 9999,
                  background: '#eef2ff',
                  color: '#3730a3',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  border: '1px solid #c7d2fe',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {badge}
              </span>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div
            style={{
              padding: 60,
              backgroundColor: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Spinner size={8} />
          </div>
        ) : blockedReason ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              borderRadius: 14,
              backgroundColor: '#fffbeb',
              border: '1px solid #fcd34d',
              color: '#92400e',
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: '#fde68a',
                color: '#b45309',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Lock size={16} strokeWidth={2.2} />
            </span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>
                Düzenleme şu an mümkün değil
              </div>
              <div>{blockedReason}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
