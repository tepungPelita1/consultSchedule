import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { I18nProvider } from '@/lib/I18nProvider'
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

/** Routing hash ringkas: `#rank` = papan markah, selain itu = jadual. */
const viewFromHash = (): View => (window.location.hash === '#rank' ? 'rank' : 'schedule')

function useHashView(): View {
  const [view, setView] = useState<View>(viewFromHash)
  useEffect(() => {
    const onHash = () => {
      setView(viewFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return view
}

function App() {
  const view = useHashView()
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {view === 'rank' ? (
          <LeaderboardPage onBack={() => (window.location.hash = 'schedule')} />
        ) : (
          <SchedulePage onShowRank={() => (window.location.hash = 'rank')} />
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
