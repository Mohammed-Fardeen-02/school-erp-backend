import { Request, Response, NextFunction } from 'express';
import { organizationsService } from './organizations.service';
import { ResponseHelper } from '../../core/http/response';

export class OrganizationsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        search: req.query.search as string,
        status: req.query.status as any,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      };

      const result = await organizationsService.getOrganizations(filters);
      ResponseHelper.paginated(res, result.items, result.meta, 'Organizations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const isPlatformUser = req.user?.userType === 'PLATFORM';
      const callerOrgId = req.organizationId;

      const organization = await organizationsService.getOrganizationById(
        id,
        callerOrgId,
        isPlatformUser
      );

      ResponseHelper.ok(res, organization, 'Organization retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const result = await organizationsService.createOrganization(req.body, adminUserId);

      ResponseHelper.created(res, result, 'Organization provisioned successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const isPlatformUser = req.user?.userType === 'PLATFORM';
      const callerOrgId = req.organizationId;
      const actorUserId = req.user?.id;

      const updated = await organizationsService.updateOrganization(
        id,
        req.body,
        callerOrgId,
        isPlatformUser,
        actorUserId
      );

      ResponseHelper.ok(res, updated, 'Organization updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const adminUserId = req.user!.id;

      const updated = await organizationsService.updateStatus(id, req.body, adminUserId);
      ResponseHelper.ok(res, updated, 'Organization status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getModules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const isPlatformUser = req.user?.userType === 'PLATFORM';
      const callerOrgId = req.organizationId;

      const modules = await organizationsService.getModules(id, callerOrgId, isPlatformUser);
      ResponseHelper.ok(res, modules, 'Subscribed modules retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateModules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const adminUserId = req.user!.id;

      const updatedModules = await organizationsService.updateModules(id, req.body, adminUserId);
      ResponseHelper.ok(res, updatedModules, 'Subscribed modules updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const organizationsController = new OrganizationsController();

