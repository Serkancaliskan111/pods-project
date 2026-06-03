import { useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext.jsx'
import CubicleSidebar, { CUBICLE_SIDEBAR_WIDTH } from './cubicle/CubicleSidebar.jsx'
import CubicleTopBar from './cubicle/CubicleTopBar.jsx'
import FloatingChatWidget from './FloatingChatWidget.jsx'
import TaskAssignModal from './TaskAssignModal.jsx'
import { TaskAssignProvider } from '../contexts/TaskAssignContext.jsx'
import { CubicleHomeProvider } from '../contexts/CubicleHomeContext.jsx'
import { HelpGuideProvider } from '../contexts/HelpGuideContext.jsx'
import HelpGuideOverlay from './cubicle/HelpGuideOverlay.jsx'
import HelpGuideDemoTaskDetail from './cubicle/helpGuideDemo/HelpGuideDemoTaskDetail.jsx'

/** Eski sayfa içeriği + Cubicle sidebar ve üst bar */
export default function MainLayout({ children }) {
  useContext(AuthContext)
  const location = useLocation()
  const isChatRoute = location.pathname.startsWith('/admin/chat')
  const isHomeRoute =
    location.pathname === '/admin' || location.pathname === '/admin/'

  return (
    <TaskAssignProvider>
      <HelpGuideProvider>
      <div
        className={`pods-admin-shell text-slate-800 ${isChatRoute ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}
      >
        <CubicleSidebar />
        <div
          className={`flex flex-col ${isChatRoute ? 'h-dvh min-h-0 overflow-hidden' : 'min-h-screen'}`}
          style={{ marginLeft: CUBICLE_SIDEBAR_WIDTH }}
        >
          {isHomeRoute ? (
            <CubicleHomeProvider>
              <CubicleTopBar showActions variant="home" />
              <main className="pods-main flex-1 overflow-y-auto px-4 pb-0 pt-4 sm:px-6 sm:pt-5">
                {children}
                <HelpGuideDemoTaskDetail />
              </main>
            </CubicleHomeProvider>
          ) : (
            <>
              <CubicleTopBar showActions variant="default" />
              <main
                className={
                  isChatRoute
                    ? 'pods-main flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pt-5'
                    : 'pods-main flex-1 overflow-y-auto px-4 pb-0 pt-4 sm:px-6 sm:pt-5'
                }
              >
                {children}
                <HelpGuideDemoTaskDetail />
              </main>
            </>
          )}
        </div>
        {!isChatRoute ? <FloatingChatWidget /> : null}
        <TaskAssignModal />
        <HelpGuideOverlay />
      </div>
      </HelpGuideProvider>
    </TaskAssignProvider>
  )
}
