/**
 * Personel birim kapsamı (çoklu kök birim + alt ağaç genişlemesi).
 * Web AuthContext ile mobil AuthContext aynı mantığı kullanır.
 */

export function expandUnitsFromSeeds(allUnits, seedIds) {
  const list = Array.isArray(allUnits) ? allUnits : []
  const set = new Set((seedIds || []).filter(Boolean).map(String))
  const queue = Array.from(set)
  while (queue.length) {
    const currentId = queue.shift()
    list
      .filter((unit) => String(unit?.ust_birim_id || '') === String(currentId))
      .forEach((child) => {
        const cid = String(child.id)
        if (set.has(cid)) return
        set.add(cid)
        queue.push(cid)
      })
  }
  return Array.from(set)
}

/**
 * @param {object} opts
 * @param {boolean} opts.isSystemAdmin
 * @param {Array<{id:string,ust_birim_id?:string|null}>} opts.companyUnitsList
 * @param {string|null|undefined} opts.legacyBirimId — personeller.birim_id
 * @param {string[]} opts.junctionBirimIds — personel_birimleri.birim_id kökleri
 */
export function resolveAccessibleUnitIds({
  isSystemAdmin,
  companyUnitsList,
  legacyBirimId,
  junctionBirimIds,
}) {
  const list = Array.isArray(companyUnitsList) ? companyUnitsList : []
  const seeds = [
    ...new Set((junctionBirimIds || []).filter(Boolean).map(String)),
  ]

  if (
    !seeds.length &&
    legacyBirimId != null &&
    String(legacyBirimId).trim() !== ''
  ) {
    seeds.push(String(legacyBirimId))
  }

  if (!list.length) {
    return seeds
  }

  if (isSystemAdmin) {
    return list.map((u) => u.id)
  }

  if (!seeds.length) {
    return list.map((u) => u.id)
  }

  const merged = new Set()
  for (const s of seeds) {
    expandUnitsFromSeeds(list, [s]).forEach((id) => merged.add(id))
  }
  const arr = Array.from(merged)
  return arr.length ? arr : seeds
}
