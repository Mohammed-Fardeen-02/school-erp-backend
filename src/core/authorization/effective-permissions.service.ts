import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { prisma as defaultPrisma } from '../database/prisma-client';
import { getRedisClient, isRedisReachable } from '../../jobs/queues/redis-connection';
import { logger } from '../logger/app-logger';
import {
  EvaluatedRole,
  computeEffectiveNodeCodes,
} from './permission-evaluator';

export class EffectivePermissionsService {
  private cachedParentMap: Map<string, string | null> | null = null;
  private cachedAllNodeCodes: string[] | null = null;
  private lastTreeLoad = 0;
  private readonly TREE_CACHE_TTL_MS = 60_000; // 1 minute in-memory cache for node tree structure

  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly getRedis: () => Redis = getRedisClient,
    private readonly checkRedisReachable?: () => Promise<boolean>
  ) {}

  /**
   * Probes if Redis is available with a short timeout.
   */
  private async isRedisAvailable(): Promise<boolean> {
    if (this.checkRedisReachable) {
      return this.checkRedisReachable();
    }
    try {
      return await isRedisReachable(300);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves or builds the version-stamped Redis cache key:
   * rbac:perms:<orgId>:<userId>:<locId || 'org'>:<vOrg>:<vUser>
   *
   * If Redis is unreachable, returns null.
   */
  private async buildCacheKey(
    userId: string,
    organizationId: string,
    locationId?: string | null
  ): Promise<string | null> {
    const available = await this.isRedisAvailable();
    if (!available) return null;

    try {
      const redis = this.getRedis();
      const orgKey = `rbac:v:org:${organizationId}`;
      const userKey = `rbac:v:user:${userId}:${organizationId}`;

      const [vOrg, vUser] = await redis.mget(orgKey, userKey);

      let resolvedVOrg = vOrg;
      if (!resolvedVOrg) {
        resolvedVOrg = '1';
        await redis.set(orgKey, '1', 'NX').catch(() => {});
      }

      let resolvedVUser = vUser;
      if (!resolvedVUser) {
        resolvedVUser = '1';
        await redis.set(userKey, '1', 'NX').catch(() => {});
      }

      const scope = locationId ? locationId : 'org';
      return `rbac:perms:${organizationId}:${userId}:${scope}:${resolvedVOrg}:${resolvedVUser}`;
    } catch (err) {
      logger.warn({ err }, '[RBAC Cache] Error building Redis cache key');
      return null;
    }
  }

  /**
   * Loads the permission tree hierarchy and all active node codes.
   * Cached in-process for 60 seconds to avoid repeated DB queries.
   */
  private async loadNodeHierarchy(): Promise<{
    allNodeCodes: string[];
    parentMap: Map<string, string | null>;
  }> {
    const now = Date.now();
    if (
      this.cachedAllNodeCodes &&
      this.cachedParentMap &&
      now - this.lastTreeLoad < this.TREE_CACHE_TTL_MS
    ) {
      return {
        allNodeCodes: this.cachedAllNodeCodes,
        parentMap: this.cachedParentMap,
      };
    }

    const nodes = await (this.prisma as any).permissionNode.findMany({
      where: { isActive: true },
      select: {
        nodeCode: true,
        parent: {
          select: { nodeCode: true },
        },
      },
    });

    const parentMap = new Map<string, string | null>();
    const allNodeCodes: string[] = [];

    for (const node of nodes) {
      allNodeCodes.push(node.nodeCode);
      parentMap.set(node.nodeCode, node.parent?.nodeCode || null);
    }

    this.cachedAllNodeCodes = allNodeCodes;
    this.cachedParentMap = parentMap;
    this.lastTreeLoad = now;

    return { allNodeCodes, parentMap };
  }

  /**
   * Fetches active user roles and capability matrices from PostgreSQL for the given user, org, and scope.
   */
  public async loadUserRolesFromDb(
    userId: string,
    organizationId: string,
    locationId?: string | null
  ): Promise<EvaluatedRole[]> {
    const userRoles = await (this.prisma as any).userRole.findMany({
      where: {
        userId,
        organizationId,
        isActive: true,
        membership: {
          status: 'ACTIVE',
        },
        OR: [
          { locationId: null },
          ...(locationId ? [{ locationId }] : []),
        ],
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                node: {
                  select: { nodeCode: true },
                },
              },
            },
          },
        },
      },
    });

    const evaluatedRoles: EvaluatedRole[] = [];

    for (const ur of userRoles) {
      // Role must be active
      if (!ur.role || !ur.role.isActive) continue;

      const grants: Record<string, boolean> = {};
      if (Array.isArray(ur.role.permissions)) {
        for (const p of ur.role.permissions) {
          if (p.node?.nodeCode) {
            grants[p.node.nodeCode] = p.isGranted;
          }
        }
      }

      evaluatedRoles.push({
        roleId: ur.role.id,
        roleCode: ur.role.roleCode,
        roleName: ur.role.roleName,
        isActive: ur.role.isActive,
        locationId: ur.locationId,
        grants,
      });
    }

    return evaluatedRoles;
  }

  /**
   * Computes effective permissions directly from PostgreSQL.
   */
  private async computeFromDatabase(
    userId: string,
    organizationId: string,
    locationId?: string | null
  ): Promise<Set<string>> {
    const roles = await this.loadUserRolesFromDb(userId, organizationId, locationId);
    const { allNodeCodes, parentMap } = await this.loadNodeHierarchy();

    return computeEffectiveNodeCodes(roles, allNodeCodes, {
      locationId,
      parentMap,
    });
  }

  /**
   * Returns the set of all effectively granted permission node codes for a user.
   * Uses Redis distributed cache with automatic fallback to PostgreSQL.
   * TTL: 300 seconds (5 minutes).
   */
  public async getEffectivePermissions(
    userId: string,
    organizationId: string,
    locationId?: string | null
  ): Promise<Set<string>> {
    const cacheKey = await this.buildCacheKey(userId, organizationId, locationId);

    // 1. Try cache hit
    if (cacheKey) {
      try {
        const redis = this.getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return new Set<string>(parsed);
          }
        }
      } catch (err) {
        logger.warn({ err }, '[RBAC Cache] Redis read error, falling back to database evaluation');
      }
    }

    // 2. Compute from Database
    const effectiveCodes = await this.computeFromDatabase(userId, organizationId, locationId);

    // 3. Store in cache (5 minutes TTL)
    if (cacheKey) {
      try {
        const redis = this.getRedis();
        await redis.set(
          cacheKey,
          JSON.stringify(Array.from(effectiveCodes)),
          'EX',
          300
        );
      } catch (err) {
        logger.warn({ err }, '[RBAC Cache] Redis write error');
      }
    }

    return effectiveCodes;
  }

  /**
   * Checks whether a user holds a specific permission node code.
   * Evaluates hierarchy, deny-overrides, grant-union, and campus scoping.
   */
  public async hasPermission(
    userId: string,
    organizationId: string,
    locationId: string | null | undefined,
    targetNodeCode: string
  ): Promise<boolean> {
    const effectivePermissions = await this.getEffectivePermissions(
      userId,
      organizationId,
      locationId
    );

    return effectivePermissions.has(targetNodeCode);
  }

  /**
   * Invalidates cached permissions for a specific user within an organization
   * by incrementing the user version counter.
   */
  public async invalidateUserCache(userId: string, organizationId: string): Promise<void> {
    const available = await this.isRedisAvailable();
    if (!available) return;

    try {
      const redis = this.getRedis();
      await redis.incr(`rbac:v:user:${userId}:${organizationId}`);
    } catch (err) {
      logger.warn({ err }, '[RBAC Cache] Failed to invalidate user cache');
    }
  }

  /**
   * Invalidates cached permissions for all users in an organization
   * by incrementing the organization version counter.
   */
  public async invalidateOrgCache(organizationId: string): Promise<void> {
    const available = await this.isRedisAvailable();
    if (!available) return;

    try {
      const redis = this.getRedis();
      await redis.incr(`rbac:v:org:${organizationId}`);
    } catch (err) {
      logger.warn({ err }, '[RBAC Cache] Failed to invalidate organization cache');
    }
  }
}

export const effectivePermissionsService = new EffectivePermissionsService();
