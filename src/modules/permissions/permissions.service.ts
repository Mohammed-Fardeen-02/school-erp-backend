import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../core/database/prisma-client';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import { PermissionNodeDto, CallerEffectivePermissionsDto } from './permissions.types';

export class PermissionsService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Retrieves the canonical 4-level hierarchical permission tree.
   * MODULE (L1) -> SECTION (L2) -> FEATURE (L3) -> ACTION (L4).
   */
  async getPermissionTree(): Promise<PermissionNodeDto[]> {
    const rawNodes = await (this.prisma as any).permissionNode.findMany({
      where: { isActive: true },
      orderBy: [{ nodeLevel: 'asc' }, { displayOrder: 'asc' }],
    });

    const nodeMap = new Map<string, PermissionNodeDto>();
    const rootNodes: PermissionNodeDto[] = [];

    // Initialize DTOs
    for (const node of rawNodes) {
      nodeMap.set(node.id, {
        id: node.id,
        nodeCode: node.nodeCode,
        nodeName: node.nodeName,
        nodeType: node.nodeType,
        nodeLevel: node.nodeLevel,
        displayOrder: node.displayOrder,
        description: node.description,
        parentId: node.parentId,
        children: [],
      });
    }

    // Assemble nested hierarchy
    for (const node of rawNodes) {
      const dto = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parentDto = nodeMap.get(node.parentId)!;
        parentDto.children!.push(dto);
      } else if (node.nodeLevel === 1) {
        rootNodes.push(dto);
      }
    }

    return rootNodes;
  }

  /**
   * Resolves caller's effective permissions within the active organization and campus context.
   */
  async getCallerEffectivePermissions(
    userId: string,
    organizationId: string,
    locationId?: string | null
  ): Promise<CallerEffectivePermissionsDto> {
    const effectiveSet = await effectivePermissionsService.getEffectivePermissions(
      userId,
      organizationId,
      locationId
    );

    const permissions = Array.from(effectiveSet).sort();

    return {
      userId,
      organizationId,
      locationId: locationId || null,
      permissions,
      count: permissions.length,
      computedAt: new Date().toISOString(),
    };
  }
}

export const permissionsService = new PermissionsService();

