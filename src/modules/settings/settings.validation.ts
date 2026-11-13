import { z } from 'zod';

export const tenantSmtpConfigSchema = z.object({
  host: z.string().min(1, 'SMTP Host is required'),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['STARTTLS', 'SSL_TLS', 'NONE']),
  username: z.string().optional(),
  password: z.string().optional(),
  fromAddress: z.string().email('Valid from email is required'),
  fromName: z.string().min(1, 'Sender name is required'),
  replyTo: z.string().email().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const tenantStorageConfigSchema = z.object({
  provider: z.enum(['AWS_S3', 'CLOUDFLARE_R2', 'MINIO', 'GCS', 'LOCAL']),
  bucket: z.string().min(1, 'Bucket name is required'),
  region: z.string().min(1, 'Storage region is required'),
  endpointUrl: z.string().url().optional().or(z.literal('')),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  cdnCustomDomain: z.string().optional().or(z.literal('')),
  maxUploadSizeMb: z.number().int().min(1).max(250).default(25),
  allowedExtensions: z.array(z.string()).default(['.pdf', '.jpg', '.png', '.docx']),
  isActive: z.boolean().default(true),
});

export const tenantRazorpayConfigSchema = z.object({
  isEnabled: z.boolean().default(false),
  mode: z.enum(['TEST', 'LIVE']).default('TEST'),
  keyId: z.string().optional(),
  keySecret: z.string().optional(),
  webhookSecret: z.string().optional(),
  merchantDisplayName: z.string().optional(),
  currency: z.string().default('INR'),
  autoCapture: z.boolean().default(true),
  generateInvoicesOnSuccess: z.boolean().default(true),
});

export const tenantThemeConfigSchema = z.object({
  institutionName: z.string().min(1, 'Institution name is required'),
  logoUrl: z.string().url().optional().or(z.literal('')),
  faviconUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be valid hex color'),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be valid hex color'),
  tagline: z.string().optional(),
  emailSignature: z.string().optional(),
  defaultTheme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).default('SYSTEM'),
});

export const updateTenantConfigSchema = z.object({
  smtp: tenantSmtpConfigSchema.partial().optional(),
  storage: tenantStorageConfigSchema.partial().optional(),
  razorpay: tenantRazorpayConfigSchema.partial().optional(),
  theme: tenantThemeConfigSchema.partial().optional(),
});

export const sendTestEmailSchema = z.object({
  toEmail: z.string().email('Valid recipient email address is required'),
  subject: z.string().optional(),
  templateType: z.enum(['welcome', 'invitation', 'password_reset', 'diagnostic']).default('diagnostic'),
  customGreeting: z.string().optional(),
});

export const testStorageSchema = z.object({
  provider: z.enum(['AWS_S3', 'CLOUDFLARE_R2', 'MINIO', 'GCS', 'LOCAL']),
  bucket: z.string().min(1, 'Bucket is required'),
  region: z.string().min(1, 'Region is required'),
  endpointUrl: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

export const testRazorpaySchema = z.object({
  mode: z.enum(['TEST', 'LIVE']),
  keyId: z.string().min(5, 'Key ID is required'),
  keySecret: z.string().optional(),
});

