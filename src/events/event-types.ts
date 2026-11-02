export enum DomainEvent {
  // Authentication & User Events
  USER_REGISTERED = 'user.registered',
  USER_LOGGED_IN = 'user.logged_in',
  PASSWORD_RESET_REQUESTED = 'password.reset_requested',

  // Organization & Multi-Tenant Events (Phase 2)
  ORGANIZATION_PROVISIONED = 'organization.provisioned',
  ORGANIZATION_STATUS_CHANGED = 'organization.status_changed',
  ORGANIZATION_MODULES_UPDATED = 'organization.modules_updated',
  CAMPUS_CREATED = 'campus.created',
  CAMPUS_STATUS_CHANGED = 'campus.status_changed',
  CAMPUS_MAIN_DESIGNATED = 'campus.main_designated',

  // Academic Events
  STUDENT_ENROLLED = 'student.enrolled',
  STUDENT_TRANSFERRED = 'student.transferred',
  ATTENDANCE_MARKED = 'attendance.marked',

  // Financial Events
  FEE_INVOICE_GENERATED = 'fee.invoice_generated',
  PAYMENT_RECEIVED = 'payment.received',

  // Notification Events
  NOTIFICATION_TRIGGERED = 'notification.triggered',
}

export interface BaseDomainEventPayload {
  eventId: string;
  occurredAt: Date;
  organizationId?: string;
  schoolId?: string;
  userId?: string;
}

export interface OrganizationProvisionedEventPayload extends BaseDomainEventPayload {
  organizationId: string;
  code: string;
  legalName: string;
  adminEmail: string;
}

export interface CampusCreatedEventPayload extends BaseDomainEventPayload {
  organizationId: string;
  campusId: string;
  code: string;
  name: string;
}

export interface StudentEnrolledEventPayload extends BaseDomainEventPayload {
  studentId: string;
  admissionNumber: string;
  classId: string;
  sectionId?: string;
}

export interface PaymentReceivedEventPayload extends BaseDomainEventPayload {
  paymentId: string;
  invoiceId: string;
  studentId: string;
  amount: number;
}
