export default function TasksPageFilters({
  companyScoped,
  companies,
  currentCompanyId,
  selectedCompanyId,
  onCompanyChange,
  selectedTaskType,
  onTaskTypeChange,
  taskTypeOptions,
  getTaskTypeLabel,
  hideDateFilter = false,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  availableUnitOptions,
  selectedUnitIds,
  onToggleUnit,
  isUnitMenuOpen,
  onToggleUnitMenu,
  unitMenuRef,
}) {
  return (
    <div
      data-help="tasks-list-filters"
      className={`grid gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:grid-cols-2 ${
        hideDateFilter ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
      }`}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Şirket
        </label>
        {companyScoped && companies[0] ? (
          <span className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800">
            {companies[0].ana_sirket_adi}
          </span>
        ) : (
          <select
            value={selectedCompanyId}
            onChange={(e) => onCompanyChange(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400"
          >
            <option value="">Tüm şirketler</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ana_sirket_adi}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Görev tipi
        </label>
        <select
          value={selectedTaskType}
          onChange={(e) => onTaskTypeChange(e.target.value)}
          className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400"
        >
          <option value="">Tüm görev tipleri</option>
          {taskTypeOptions.map((tt) => (
            <option key={tt} value={tt}>
              {getTaskTypeLabel(tt)}
            </option>
          ))}
        </select>
      </div>

      {hideDateFilter ? null : (
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Tarih filtresi
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="min-h-[42px] flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
              aria-label="Başlangıç tarihi"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="min-h-[42px] flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
              aria-label="Bitiş tarihi"
            />
          </div>
        </div>
      )}

      <div className="relative flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1" ref={unitMenuRef}>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Birimler
        </label>
        <button
          type="button"
          onClick={onToggleUnitMenu}
          className="flex min-h-[42px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800"
        >
          <span>
            {selectedUnitIds.length
              ? `${selectedUnitIds.length} birim seçildi`
              : 'Tüm birimler'}
          </span>
          <span className="text-slate-400">{isUnitMenuOpen ? '▲' : '▼'}</span>
        </button>
        {isUnitMenuOpen ? (
          <div className="absolute top-[calc(100%+4px)] z-20 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {availableUnitOptions.length ? (
              availableUnitOptions.map((u) => {
                const checked = selectedUnitIds.includes(String(u.id))
                return (
                  <label
                    key={u.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                      checked ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleUnit(u.id)}
                    />
                    {u.birim_adi}
                  </label>
                )
              })
            ) : (
              <p className="px-2 py-2 text-xs text-slate-500">Birim bulunamadı.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
