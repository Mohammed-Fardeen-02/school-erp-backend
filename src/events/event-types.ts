export enum DomainEvent {
  // Authentication & User Events
  USER_REGISTERED = 'user.registered',
  USER_LOGGED_IN = 'user.logged_in',
  PASSWORD_RESET_REQUESTED = 'password.reset_requested',

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
  schoolId?: string;
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
