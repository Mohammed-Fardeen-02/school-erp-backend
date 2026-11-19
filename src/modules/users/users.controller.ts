import { Request, Response, NextFunction } from 'express';
import { usersService, UsersService } from './users.service';
import { ResponseHelper } from '../../core/http/response';
import { AuditContext } from './users.types';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  private extractAuditContext(req: Request): AuditContext {
    return {
      actorUserId: req.user ? req.user.id : 'system-anonymous',
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const query = req.query as any;

      const filters = {
        search: query.search as string | undefined,
        status: query.status as any,
        roleId: query.roleId as string | undefined,
        locationId: query.locationId as string | undefined,
        page: query.page as number | undefined,
        limit: query.limit as number | undefined,
      };

      const result = await this.service.listUsers(organizationId, filters);

      ResponseHelper.ok(res, result.users, 'Organization users retrieved successfully', {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.params.id as string;

      const user = await this.service.getUserById(organizationId, userId);
      ResponseHelper.ok(res, user, 'User details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.params.id as string;
      const audit = this.extractAuditContext(req);

      const updated = await this.service.updateUserProfile(organizationId, userId, req.body, audit);
      ResponseHelper.ok(res, updated, 'User profile updated successfully');
    } catch (error) {
      next(error);
    }
  };

  toggleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.params.id as string;
      const audit = this.extractAuditContext(req);

      const result = await this.service.toggleUserStatus(organizationId, userId, req.body, audit);
      ResponseHelper.ok(
        res,
        result.user,
        `User account successfully ${req.body.isActive ? 'activated' : 'deactivated'}`
      );
    } catch (error) {
      next(error);
    }
  };

  invite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const audit = this.extractAuditContext(req);

      const result = await this.service.inviteUser(organizationId, req.body, audit);
      ResponseHelper.created(res, result, result.message);
    } catch (error) {
      next(error);
    }
  };

  acceptInvitation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.acceptInvitation(req.body);
      ResponseHelper.ok(res, result.user, result.message);
    } catch (error) {
      next(error);
    }
  };

  resendInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const invitationId = req.params.id as string;
      const audit = this.extractAuditContext(req);

      const result = await this.service.resendInvitation(organizationId, invitationId, audit);
      ResponseHelper.ok(res, null, result.message);
    } catch (error) {
      next(error);
    }
  };

  revokeInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const invitationId = req.params.id as string;
      const audit = this.extractAuditContext(req);

      const result = await this.service.revokeInvitation(organizationId, invitationId, audit);
      ResponseHelper.ok(res, null, result.message);
    } catch (error) {
      next(error);
    }
  };

  listInvitations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = req.query.status as any;

      const invitations = await this.service.listInvitations(organizationId, status);
      ResponseHelper.ok(res, invitations, 'Invitations retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const usersController = new UsersController();

