import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { I18nProvider } from '@/lib/I18nProvider'
import ConfigWarning from '@/components/ConfigWarning'
import LeaderboardPage from '@/pages/LeaderboardPage'
import SchedulePage from '@/pages/SchedulePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

type View = 'schedule' | 'rank'

/** Routing hash ringkas: `#rank` = papan markah, selain itu (termasuk URL bersih) = jadual. */
const viewFromHash = (): View => (window.location.hash === '#rank' ? 'rank' : 'schedule')

function useHashView(): [View, (next: View) => void] {
  const [view, setView] = useState<View>(viewFromHash)
  useEffect(() => {
    const onNav = () => {
      setView(viewFromHash())
      window.scrollTo(0, 0)
    }
    // popstate: butang Back dari URL bersih (pushState) ke #rank & sebaliknya.
    window.addEventListener('hashchange', onNav)
    window.addEventListener('popstate', onNav)
    return () => {
      window.removeEventListener('hashchange', onNav)
      window.removeEventListener('popstate', onNav)
    }
  }, [])

  const go = (next: View) => {
    if (next === 'rank') {
      window.location.hash = 'rank'
      return
    }
    // Jadual = URL bersih (tanpa #schedule).
    window.history.pushState(null, '', window.location.pathname + window.location.search)
    setView('schedule')
    window.scrollTo(0, 0)
  }

  return [view, go]
}

function App() {
  const [view, go] = useHashView()
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ConfigWarning />
        {view === 'rank' ? (
          <LeaderboardPage onBack={() => go('schedule')} />
        ) : (
          <SchedulePage onShowRank={() => go('rank')} />
        )}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              border: '1px solid var(--ink)',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontFamily: 'var(--sans)',
              borderRadius: '10px',
              boxShadow: 'none',
            },
          }}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
}

export default App
