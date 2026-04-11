import { useEffect, useState } from 'react'
import getSupabase from '../../lib/supabaseClient'
import MainLayout from '../../components/MainLayout'

const supabase = getSupabase()

export default function AnaSirketlerList() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: rows, error } = await supabase
        .from('ana_sirketler')
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
      <h1 className="text-2xl font-bold mb-4">Şirketler</h1>
      {loading ? (
        <div>Yükleniyor...</div>
      ) : (
        <ul className="space-y-2">
          {data.map((s) => (
            <li key={s.id} className="p-3 bg-white rounded shadow-sm">
              <div className="font-semibold">{s.ana_sirket_adi}</div>
              <div className="text-sm text-gray-600">Vergi No: {s.vergi_no}</div>
            </li>
          ))}
        </ul>
      )}
    </MainLayout>
  )
}

