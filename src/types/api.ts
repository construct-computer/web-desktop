export interface User {
  id: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  setupCompleted: boolean;
  plan: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export type ApiResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; data?: Record<string, unknown> };
