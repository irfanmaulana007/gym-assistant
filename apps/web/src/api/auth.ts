import { request } from './client'
import type { AuthResponse, User } from '@/types/api'

export const authApi = {
  register(email: string, password: string, displayName: string) {
    return request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      anonymous: true,
      body: { email, password, display_name: displayName },
    })
  },
  login(email: string, password: string) {
    return request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      anonymous: true,
      body: { email, password },
    })
  },
  me() {
    return request<User>('/api/v1/auth/me')
  },
}
