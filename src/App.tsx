import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { I18nProvider } from '@/lib/I18nProvider'
import SchedulePage from '@/pages/SchedulePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SchedulePage />
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
