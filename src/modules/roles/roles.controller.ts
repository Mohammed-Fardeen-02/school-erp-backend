import { Request, Response, NextFunction } from 'express';
import { rolesService, RolesService } from './roles.service';
import { ResponseHelper } from '../../core/http/response';
import { AuditContext } from './roles.types';

export class RolesController {
  constructor(private readonly service: RolesService = rolesService) {}

  private extractAuditContext(req: Request): AuditContext {
    return {
      actorUserId: req.user!.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const filters = {
        search: req.query.search as string,
        isActive: req.query.isActive as any,
        roleType: req.query.roleType as any,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      };

      const result = await this.service.listRoles(organizationId, filters);
      ResponseHelper.ok(res, result.roles, 'Roles retrieved successfully', {
        total: result.total,
        page: filters.page,
        limit: filters.limit,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = req.params.roleId as string;
      const organizationId = req.organizationId!;

      const role = await this.service.getRoleById(roleId, organizationId);
      ResponseHelper.ok(res, role, 'Role details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const created = await this.service.createCustomRole(organizationId, req.body, audit);
      ResponseHelper.created(res, created, 'Custom role created successfully');
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = req.params.roleId as string;
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const updated = await this.service.updateCustomRole(
        roleId,
        organizationId,
        req.body,
        audit
      );
      ResponseHelper.ok(res, updated, 'Role updated successfully');
    } catch (error) {
      next(error);
    }
  };

  toggleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = req.params.roleId as string;
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const updated = await this.service.toggleRoleStatus(
        roleId,
        organizationId,
        req.body.isActive,
        audit
      );
      ResponseHelper.ok(res, updated, `Role status successfully updated to ${req.body.isActive ? 'active' : 'inactive'}`);
    } catch (error) {
      next(error);
    }
  };

  clone = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const templateId = req.params.templateId as string;
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const cloned = await this.service.cloneTemplate(
        templateId,
        organizationId,
        req.body,
        audit
      );
      ResponseHelper.created(res, cloned, 'Role template cloned into custom role successfully');
    } catch (error) {
      next(error);
    }
  };

  deleteOrArchive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = req.params.roleId as string;
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const result = await this.service.deleteOrArchiveRole(roleId, organizationId, audit);
      ResponseHelper.ok(res, result, result.message);
    } catch (error) {
      next(error);
    }
  };

  getPermissionsMatrix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = req.params.roleId as string;
      const organizationId = req.organizationId!;

      const matrix = await this.service.getRolePermissionsMatrix(roleId, organizationId);
      ResponseHelper.ok(res, matrix, 'Role permission matrix retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  updatePermissionsMatrix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roleId = req.params.roleId as string;
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      await this.service.updateRolePermissions(roleId, organizationId, req.body, audit);
      ResponseHelper.ok(res, null, 'Role permission matrix updated successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const rolesController = new RolesController();
