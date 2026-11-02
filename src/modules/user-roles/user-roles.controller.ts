import { Request, Response, NextFunction } from 'express';
import { userRolesService, UserRolesService } from './user-roles.service';
import { ResponseHelper } from '../../core/http/response';
import { AuditContext } from './user-roles.types';

export class UserRolesController {
  constructor(private readonly service: UserRolesService = userRolesService) {}

  private extractAuditContext(req: Request): AuditContext {
    return {
      actorUserId: req.user!.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  /**
   * Assigns a role to a user.
   * POST /api/v1/user-roles/assign
   */
  assign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const created = await this.service.assignRole(
        req.user!.id,
        organizationId,
        req.body,
        audit
      );

      ResponseHelper.created(res, created, 'Role assigned successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * Revokes an existing active role assignment.
   * POST /api/v1/user-roles/:assignmentId/revoke
   */
  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assignmentId = req.params.assignmentId as string;
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const updated = await this.service.revokeRole(
        req.user!.id,
        organizationId,
        assignmentId,
        req.body,
        audit
      );

      ResponseHelper.ok(res, updated, 'Role assignment revoked successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * Lists active and historical assignments for a specific user.
   * GET /api/v1/user-roles/users/:userId
   */
  listByUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params.userId as string;
      const organizationId = req.organizationId!;
      const filters = {
        isActive: req.query.isActive as any,
        locationId: req.query.locationId as string | undefined,
      };

      const assignments = await this.service.listUserAssignments(
        req.user!.id,
        organizationId,
        userId,
        filters
      );

      ResponseHelper.ok(res, assignments, 'User role assignments retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const userRolesController = new UserRolesController();

