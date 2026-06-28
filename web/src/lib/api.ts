import axios from 'axios'

const TOKEN_KEY = 'lefinance.token'
const USER_KEY = 'lefinance.user'
const WORKSPACE_KEY = 'lefinance.workspace'

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

// Response interceptor – on 401, clear session and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(WORKSPACE_KEY)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api
