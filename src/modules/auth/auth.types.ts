export interface JwtAccessPayload {
  sub: string;
  email: string;
  userType: 'PLATFORM' | 'TENANT';
  tokenVersion: number;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'PLATFORM' | 'TENANT';
  avatarUrl: string | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

export interface LoginResponse {
  user: AuthUserDto;
  tokens: AuthTokens;
}

export interface SessionDto {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
  createdAt: Date;
  expiresAt: Date;
}

