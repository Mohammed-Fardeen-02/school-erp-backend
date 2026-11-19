import { OrganizationAccessLevel, MembershipType, MembershipStatus, InvitationStatus } from '@prisma/client';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED';

export interface UserRoleAssignmentSummary {
  id: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  roleType: string;
  locationId: string | null;
  locationName: string | null;
  isActive: boolean;
  assignedAt: string;
}

export interface UserSummaryDto {
  id: string;
  userCode: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  userType: 'PLATFORM' | 'TENANT';
  membershipType: MembershipType;
  accessLevel: OrganizationAccessLevel;
  primaryRole: string;
  assignedCampus: string;
  roles: UserRoleAssignmentSummary[];
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserDetailDto extends UserSummaryDto {
  memberships: {
    id: string;
    organizationId: string;
    organizationName: string;
    accessLevel: OrganizationAccessLevel;
    membershipType: MembershipType;
    status: MembershipStatus;
    isPrimary: boolean;
    joinedAt: string;
  }[];
  activeSessionsCount: number;
}

export interface InviteUserDto {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
  locationId?: string | null;
  accessLevel?: OrganizationAccessLevel;
  membershipType?: MembershipType;
  sendEmailNotification?: boolean;
}

export interface AcceptInvitationDto {
  token: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface UpdateUserProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface ToggleUserStatusDto {
  isActive: boolean;
  reason?: string;
}

export interface UserQueryFilters {
  search?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED';
  roleId?: string;
  locationId?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedUsersResult {
  users: UserSummaryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvitationSummaryDto {
  id: string;
  organizationId: string;
  email: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  locationId: string | null;
  locationName: string | null;
  accessLevel: OrganizationAccessLevel;
  membershipType: MembershipType;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface AuditContext {
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
}

