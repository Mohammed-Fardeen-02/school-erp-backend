import { Request, Response, NextFunction } from 'express';
import { permissionsService, PermissionsService } from './permissions.service';
import { ResponseHelper } from '../../core/http/response';

export class PermissionsController {
  constructor(private readonly service: PermissionsService = permissionsService) {}

  getTree = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tree = await this.service.getPermissionTree();
      ResponseHelper.ok(res, tree, 'Canonical permission tree catalog retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const organizationId = req.organizationId!;
      const locationId = req.locationId || null;

      const effective = await this.service.getCallerEffectivePermissions(
        userId,
        organizationId,
        locationId
      );
      ResponseHelper.ok(res, effective, 'Caller effective permissions retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}

export const permissionsController = new PermissionsController();

