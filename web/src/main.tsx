import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

import '@/index.css'
import { queryClient } from '@/lib/query'
import { SessionProvider } from '@/features/auth/session'
import { Toaster } from '@/components/ui/sonner'
import { router } from '@/app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
        <Toaster />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
