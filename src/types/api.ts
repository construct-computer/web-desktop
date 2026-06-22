export interface User {
  id: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  setupCompleted: boolean;
  onboardingCompleted: boolean;
  plan: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type ApiResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; status?: number; data?: Record<string, unknown> };
