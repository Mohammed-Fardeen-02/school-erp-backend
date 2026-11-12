export type EmailTemplateId =
  | 'USER_INVITATION'
  | 'ORG_WELCOME'
  | 'PASSWORD_RESET'
  | 'EMAIL_VERIFICATION';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  accepted: string[];
  rejected: string[];
  error?: string;
  timestamp: string;
}

export interface TenantSmtpSettings {
  host: string;
  port: number;
  security: 'STARTTLS' | 'SSL_TLS' | 'NONE';
  user?: string;
  password?: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  isActive: boolean;
}
