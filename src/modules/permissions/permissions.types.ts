import { NodeType } from '@prisma/client';

export interface PermissionNodeDto {
  id: string;
  nodeCode: string;
  nodeName: string;
  nodeType: NodeType;
  nodeLevel: number;
  displayOrder: number;
  description: string | null;
  parentId: string | null;
  children?: PermissionNodeDto[];
}

export interface CallerEffectivePermissionsDto {
  userId: string;
  organizationId: string;
  locationId: string | null;
  permissions: string[];
  count: number;
  computedAt: string;
}

