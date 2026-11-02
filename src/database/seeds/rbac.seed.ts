import { PrismaClient } from '@prisma/client';
import {
  CANONICAL_PERMISSION_TREE,
  SYSTEM_ROLE_TEMPLATES,
  PermissionNodeDefinition,
} from '../../shared/constants/permissions-catalog';

export interface RbacSeedResult {
  nodesCount: {
    modules: number;
    sections: number;
    features: number;
    actions: number;
    total: number;
  };
  rolesCount: number;
  rolePermissionsCount: number;
}

/**
 * Seeds the Canonical Permission Tree and 8 System Role Templates.
 * 100% idempotent: can be executed safely multiple times.
 */
export async function seedRbacCatalog(prisma: PrismaClient): Promise<RbacSeedResult> {
  console.log('🌳 [RBAC Seed] Starting Canonical Permission Tree Seeding...');

  // -------------------------------------------------------------------------
  // 1. Flatten and categorize canonical permission nodes by level
  // -------------------------------------------------------------------------
  interface FlatNode extends Omit<PermissionNodeDefinition, 'children'> {
    parentCode?: string;
  }

  const level1Nodes: FlatNode[] = [];
  const level2Nodes: FlatNode[] = [];
  const level3Nodes: FlatNode[] = [];
  const level4Nodes: FlatNode[] = [];

  function traverse(node: PermissionNodeDefinition, parentCode?: string) {
    const flat: FlatNode = {
      nodeCode: node.nodeCode,
      nodeName: node.nodeName,
      nodeType: node.nodeType,
      nodeLevel: node.nodeLevel,
      displayOrder: node.displayOrder,
      description: node.description,
      parentCode,
    };

    if (node.nodeLevel === 1) level1Nodes.push(flat);
    else if (node.nodeLevel === 2) level2Nodes.push(flat);
    else if (node.nodeLevel === 3) level3Nodes.push(flat);
    else if (node.nodeLevel === 4) level4Nodes.push(flat);

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child, node.nodeCode);
      }
    }
  }

  for (const root of CANONICAL_PERMISSION_TREE) {
    traverse(root);
  }

  // -------------------------------------------------------------------------
  // 2. Insert nodes level-by-level to satisfy the hierarchy trigger
  // -------------------------------------------------------------------------
  const codeToIdMap = new Map<string, string>();

  // Fetch any existing nodes first into the map
  const existingNodes = await prisma.permissionNode.findMany({
    select: { id: true, nodeCode: true },
  });
  for (const n of existingNodes) {
    codeToIdMap.set(n.nodeCode, n.id);
  }

  async function upsertBatch(nodes: FlatNode[]) {
    for (const node of nodes) {
      const parentId = node.parentCode ? codeToIdMap.get(node.parentCode) : null;

      const record = await prisma.permissionNode.upsert({
        where: { nodeCode: node.nodeCode },
        update: {
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          nodeLevel: node.nodeLevel,
          displayOrder: node.displayOrder,
          description: node.description,
          isActive: true,
        },
        create: {
          nodeCode: node.nodeCode,
          nodeName: node.nodeName,
          nodeType: node.nodeType,
          nodeLevel: node.nodeLevel,
          displayOrder: node.displayOrder,
          description: node.description,
          parentId,
          isActive: true,
        },
      });

      codeToIdMap.set(node.nodeCode, record.id);
    }
  }

  console.log(`  -> Seeding ${level1Nodes.length} MODULE nodes (Level 1)...`);
  await upsertBatch(level1Nodes);

  console.log(`  -> Seeding ${level2Nodes.length} SECTION nodes (Level 2)...`);
  await upsertBatch(level2Nodes);

  console.log(`  -> Seeding ${level3Nodes.length} FEATURE nodes (Level 3)...`);
  await upsertBatch(level3Nodes);

  console.log(`  -> Seeding ${level4Nodes.length} ACTION nodes (Level 4)...`);
  await upsertBatch(level4Nodes);

  const totalNodes = level1Nodes.length + level2Nodes.length + level3Nodes.length + level4Nodes.length;
  console.log(`✅ [RBAC Seed] Canonical tree seeded: ${totalNodes} total nodes.`);

  // -------------------------------------------------------------------------
  // 3. Seed the 8 Approved System Role Templates (organization_id IS NULL)
  // -------------------------------------------------------------------------
  console.log('👥 [RBAC Seed] Seeding 8 System Role Templates & Grant Matrices...');
  let totalGrantsCount = 0;

  for (const tpl of SYSTEM_ROLE_TEMPLATES) {
    let role = await prisma.role.findFirst({
      where: {
        roleCode: tpl.roleCode,
        organizationId: null,
      },
    });

    if (role) {
      role = await prisma.role.update({
        where: { id: role.id },
        data: {
          roleName: tpl.roleName,
          description: tpl.description,
          isActive: true,
        },
      });
    } else {
      role = await prisma.role.create({
        data: {
          roleCode: tpl.roleCode,
          roleName: tpl.roleName,
          description: tpl.description,
          roleType: 'SYSTEM_TEMPLATE',
          organizationId: null,
          isActive: true,
        },
      });
    }

    // Seed grants for this template
    for (const code of tpl.grantedNodeCodes) {
      const nodeId = codeToIdMap.get(code);
      if (!nodeId) {
        console.warn(`⚠️ [RBAC Seed] Node code "${code}" not found for role ${tpl.roleCode}`);
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_nodeId: {
            roleId: role.id,
            nodeId,
          },
        },
        update: {
          isGranted: true,
        },
        create: {
          roleId: role.id,
          nodeId,
          isGranted: true,
        },
      });
      totalGrantsCount++;
    }

    console.log(`  -> [Template] ${tpl.roleCode} (${tpl.roleName}): ${tpl.grantedNodeCodes.length} capability nodes mapped.`);
  }

  console.log(`✅ [RBAC Seed] ${SYSTEM_ROLE_TEMPLATES.length} system templates initialized with ${totalGrantsCount} grants.`);

  return {
    nodesCount: {
      modules: level1Nodes.length,
      sections: level2Nodes.length,
      features: level3Nodes.length,
      actions: level4Nodes.length,
      total: totalNodes,
    },
    rolesCount: SYSTEM_ROLE_TEMPLATES.length,
    rolePermissionsCount: totalGrantsCount,
  };
}

// Standalone execution support
if (process.argv[1]?.endsWith('rbac.seed.ts') || process.argv[1]?.endsWith('rbac.seed.js')) {
  const standalonePrisma = new PrismaClient();
  seedRbacCatalog(standalonePrisma)
    .then((res) => {
      console.log('\nSeed Results:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('RBAC Seeding failed:', err);
      process.exit(1);
    })
    .finally(() => standalonePrisma.$disconnect());
}

