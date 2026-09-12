import { request } from './client'
import type { AuthResponse, User, UpdateProfileRequest } from '@/types/api'

export const authApi = {
  register(email: string, password: string, displayName: string, username?: string) {
    return request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      anonymous: true,
      body: {
        email,
        password,
        display_name: displayName,
        ...(username ? { username } : {}),
      },
    })
  },
  login(identifier: string, password: string) {
    return request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      anonymous: true,
      body: { identifier, password },
    })
  },
  me() {
    return request<User>('/api/v1/auth/me')
  },
  updateProfile(patch: UpdateProfileRequest) {
    return request<User>('/api/v1/auth/me', { method: 'PATCH', body: patch })
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request<void>('/api/v1/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    })
  },
}
