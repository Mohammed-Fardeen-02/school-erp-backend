import { RoleType } from '@prisma/client';

export interface RoleResponseDto {
  id: string;
  organizationId: string | null;
  roleCode: string;
  roleName: string;
  description: string | null;
  roleType: RoleType;
  isActive: boolean;
  permissionCount: number;
  userCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionGrantItem {
  nodeId?: string;
  nodeCode?: string;
  isGranted: boolean;
}

export interface CreateRoleDto {
  roleCode: string;
  roleName: string;
  description?: string;
  permissions?: PermissionGrantItem[];
}

export interface UpdateRoleDto {
  roleName?: string;
  description?: string;
}

export interface RoleStatusDto {
  isActive: boolean;
}

export interface CloneTemplateDto {
  roleCode: string;
  roleName: string;
  description?: string;
}

export interface RolePermissionMatrixItem {
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  nodeType: string;
  nodeLevel: number;
  displayOrder: number;
  description: string;
  isGranted: boolean;
  isDirect: boolean;
}

export interface RolePermissionsMatrixDto {
  roleId: string;
  roleCode: string;
  roleName: string;
  roleType: RoleType;
  permissions: RolePermissionMatrixItem[];
}

export interface UpdateRolePermissionsDto {
  permissions: PermissionGrantItem[];
}

export interface RoleFilterOptions {
  search?: string;
  isActive?: boolean;
  roleType?: RoleType;
  page?: number;
  limit?: number;
}

export interface AuditContext {
  actorUserId: string;
  ipAddress: string;
  userAgent: string;
}

