import axios from 'axios'
import { TOKEN_KEY, clearSession } from './constants'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Request interceptor – inject Bearer token when present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor – on 401, clear session and redirect to login.
// Do NOT redirect when the failing request is itself an auth attempt
// (login/register) or the user is already on /login, so the form can
// surface the error instead of reloading the page.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const url = error.config?.url ?? ''
      const onLogin = window.location.pathname.startsWith('/login')
      if (
        status === 401 &&
        !url.includes('/auth/login') &&
        !url.includes('/auth/register') &&
        !onLogin
      ) {
        clearSession()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default api
