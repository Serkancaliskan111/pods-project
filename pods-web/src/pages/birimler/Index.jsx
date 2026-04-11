import { useEffect, useState } from 'react'
import getSupabase from '../../lib/supabaseClient'
import MainLayout from '../../components/MainLayout'

const supabase = getSupabase()

export default function BirimlerList() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: rows, error } = await supabase
        .from('birimler')
        .select('*')
        .is('silindi_at', null)
      if (!error && mounted) setData(rows)
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <MainLayout>
      <h1 className="text-2xl font-bold mb-4">Birimler</h1>
      {loading ? (
        <div>Yükleniyor...</div>
      ) : (
        <ul className="space-y-2">
          {data.map((b) => (
            <li key={b.id} className="p-3 bg-white rounded shadow-sm">
              <div className="font-semibold">{b.birim_adi}</div>
              <div className="text-sm text-gray-600">Tip: {b.birim_tipi}</div>
            </li>
          ))}
        </ul>
      )}
    </MainLayout>
  )
}

