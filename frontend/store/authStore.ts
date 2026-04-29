import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthUser, TokenPair } from '@/types/auth.types'
import { saveSession, clearSession } from '@/services/api'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  isLoggingOut: boolean

  // Actions
  setUser: (user: AuthUser) => void
  setTokens: (tokens: TokenPair) => void
  setLoading: (loading: boolean) => void
  setLoggingOut: (v: boolean) => void
  logout: () => void

  // Helpers
  hasRole: (role: string) => boolean
  hasModule: (moduleSlug: string) => boolean
  hasPermission: (permission: string) => boolean
  isAdmin: () => boolean
  isSuperAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isLoggingOut: false,

      setUser: (user) =>
        set({ user, isAuthenticated: true }),

      setTokens: (tokens) => {
        saveSession(tokens.access_token, tokens.refresh_token)
      },

      setLoading: (loading) =>
        set({ isLoading: loading }),
      setLoggingOut: (v) =>
        set({ isLoggingOut: v }),

      logout: () => {
        clearSession()
        set({ user: null, isAuthenticated: false })
      },

      hasRole: (role) => {
        const { user } = get()
        return user?.roles?.includes(role) ?? false
      },

      hasModule: (moduleSlug) => {
        const { user } = get()
        return user?.modules?.includes(moduleSlug) ?? false
      },

      hasPermission: (permission) => {
        const { user } = get()
        return user?.permissions?.includes(permission) ?? false
      },

      isAdmin: () => {
        const { user } = get()
        return (
          user?.roles?.includes('super_admin') ||
          user?.roles?.includes('admin_empresa')
        ) ?? false
      },

      isSuperAdmin: () => {
        const { user } = get()
        return user?.roles?.includes('super_admin') ?? false
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)