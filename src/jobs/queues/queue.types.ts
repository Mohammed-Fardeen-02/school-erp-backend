export const QUEUE_NAMES = {
  EMAIL_NOTIFICATION: 'email-notification-queue',
  TENANT_PROVISIONING: 'tenant-provisioning-queue',
  AUDIT_LOG_ARCHIVE: 'audit-log-archive-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
  organizationId?: string;
}

export interface TenantProvisioningJobData {
  organizationId: string;
  organizationCode: string;
  adminEmail: string;
}

