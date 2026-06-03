import { useHelpGuideOptional } from '../contexts/HelpGuideContext.jsx'
import { HELP_GUIDE_INTERACTIVE_Z } from '../lib/helpGuideLayers.js'

/**
 * Kılavuz turu aktifken açılır panellerin overlay gölgesinin üstünde kalması için z-index.
 * @param {number} [defaultZ]
 */
export function useHelpGuidePopoverZ(defaultZ = 10040) {
  const guide = useHelpGuideOptional()
  return guide?.isActive ? HELP_GUIDE_INTERACTIVE_Z : defaultZ
}
