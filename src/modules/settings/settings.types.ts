export interface TenantSmtpConfig {
  host: string;
  port: number;
  security: 'STARTTLS' | 'SSL_TLS' | 'NONE';
  username?: string;
  password?: string;
  isPasswordSet?: boolean;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  isActive: boolean;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

export interface TenantStorageConfig {
  provider: 'AWS_S3' | 'CLOUDFLARE_R2' | 'MINIO' | 'GCS' | 'LOCAL';
  bucket: string;
  region: string;
  endpointUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  isSecretSet?: boolean;
  cdnCustomDomain?: string;
  maxUploadSizeMb: number;
  allowedExtensions: string[];
  isActive: boolean;
  lastTestedAt?: string | null;
}

export interface TenantRazorpayConfig {
  isEnabled: boolean;
  mode: 'TEST' | 'LIVE';
  keyId?: string;
  keySecret?: string;
  isSecretSet?: boolean;
  webhookSecret?: string;
  merchantDisplayName?: string;
  currency: string;
  autoCapture: boolean;
  generateInvoicesOnSuccess: boolean;
  lastVerifiedAt?: string | null;
}

export interface TenantThemeConfig {
  institutionName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  accentColor: string;
  tagline?: string;
  emailSignature?: string;
  defaultTheme: 'SYSTEM' | 'LIGHT' | 'DARK';
}

export interface TenantConfigurationDto {
  organizationId: string;
  smtp: TenantSmtpConfig;
  storage: TenantStorageConfig;
  razorpay: TenantRazorpayConfig;
  theme: TenantThemeConfig;
  updatedAt: string;
}

export interface UpdateTenantConfigDto {
  smtp?: Partial<TenantSmtpConfig>;
  storage?: Partial<TenantStorageConfig>;
  razorpay?: Partial<TenantRazorpayConfig>;
  theme?: Partial<TenantThemeConfig>;
}

export interface SendTestEmailDto {
  toEmail: string;
  subject?: string;
  templateType?: 'welcome' | 'invitation' | 'password_reset' | 'diagnostic';
  customGreeting?: string;
}

export interface TestStorageDto {
  provider: 'AWS_S3' | 'CLOUDFLARE_R2' | 'MINIO' | 'GCS' | 'LOCAL';
  bucket: string;
  region: string;
  endpointUrl?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface TestRazorpayDto {
  mode: 'TEST' | 'LIVE';
  keyId: string;
  keySecret?: string;
}

