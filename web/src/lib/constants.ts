export const TOKEN_KEY = 'lefinance.token'
export const USER_KEY = 'lefinance.user'
export const WORKSPACE_KEY = 'lefinance.workspace'

/** Removes all session-related keys from localStorage. */
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(WORKSPACE_KEY)
}
