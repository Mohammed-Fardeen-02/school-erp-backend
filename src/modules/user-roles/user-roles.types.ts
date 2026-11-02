import { RoleType } from '@prisma/client';

export interface AssignRoleDto {
  userId: string;
  roleId: string;
  locationId?: string | null;
}

export interface RevokeRoleDto {
  reason: string;
}

export interface UserRoleFilterOptions {
  isActive?: boolean;
  locationId?: string;
  allowedLocationIds?: string[];
}

export interface RoleSummary {
  id: string;
  roleCode: string;
  roleName: string;
  roleType: RoleType;
  description?: string | null;
}

export interface LocationSummary {
  id: string;
  code: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface UserRoleResponseDto {
  id: string;
  userId: string;
  organizationId: string;
  roleId: string;
  locationId: string | null;
  membershipId: string;
  isActive: boolean;
  assignedBy: string | null;
  assignedAt: Date;
  revokedBy: string | null;
  revokedAt: Date | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: RoleSummary;
  location?: LocationSummary | null;
  user?: UserSummary;
}

export interface AuditContext {
  actorUserId: string;
  ipAddress: string;
  userAgent: string;
}

