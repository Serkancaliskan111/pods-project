import { createContext, useContext } from 'react'

/**
 * @typedef {object} ManagementKokpitEmbedValue
 * @property {'project'} mode
 * @property {object[]} jobs
 * @property {object[]} [metricJobs]
 * @property {object[]} companies
 * @property {object[]} units
 * @property {object[]} staff
 * @property {boolean} [loading]
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {boolean} [companyScoped]
 * @property {string} [scopedCompanyName]
 * @property {(params?: { status?: string, alert?: string, mode?: string, quickFilter?: string }) => void} [onTasksList]
 * @property {(task: object) => void} [onTaskOpen]
 */

export const ManagementKokpitContext = createContext(null)

export function ManagementKokpitProvider({ value, children }) {
  return (
    <ManagementKokpitContext.Provider value={value}>{children}</ManagementKokpitContext.Provider>
  )
}

export function useManagementKokpitEmbed() {
  return useContext(ManagementKokpitContext)
}
