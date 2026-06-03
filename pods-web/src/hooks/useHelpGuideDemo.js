import { useHelpGuideOptional } from '../contexts/HelpGuideContext.jsx'

/**
 * Kılavuz turu aktifken ve adım bu sahneyi istiyorsa örnek veri kullanılır.
 * @param {import('../lib/helpGuideDemoData.js').HelpDemoScene} scene
 */
export function useHelpGuideDemo(scene) {
  const guide = useHelpGuideOptional()
  const enabled =
    !!guide?.isActive &&
    !!guide?.isDemoMode &&
    guide?.currentStep?.demoScene === scene
  return {
    enabled,
    scene: enabled ? scene : null,
    guide,
  }
}
