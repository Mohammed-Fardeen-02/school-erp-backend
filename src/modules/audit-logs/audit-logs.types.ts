export interface AuditLogRecord {
  id: string;
  organizationId: string | null;
  locationId: string | null;
  campusName?: string | null;
  userId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogQueryFilters {
  search?: string;
  action?: string;
  entity?: string;
  userId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogExportFilters {
  search?: string;
  action?: string;
  entity?: string;
  userId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
  format?: 'csv' | 'json';
}
