export default function UnitsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-[var(--color-primary)]">Birim & Bayi Hiyerarşisi</h2>
      </div>
      <div className="p-4 bg-white rounded shadow">
        <p>Hiyerarşi ağacı (placeholder)</p>
        <ul className="mt-3">
          <li>• Bölge A</li>
          <li className="ml-4">◦ Ana Bayi A1</li>
          <li className="ml-8">▪ Alt Bayi A1-1</li>
        </ul>
      </div>
    </div>
  )
}

