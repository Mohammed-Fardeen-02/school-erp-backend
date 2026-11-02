import { Request, Response, NextFunction } from 'express';
import { workspaceService } from './workspace.service';
import { ResponseHelper } from '../../core/http/response';

export class WorkspaceController {
  async myOrganizations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const organizations = await workspaceService.getUserOrganizations(userId);
      ResponseHelper.ok(res, organizations, 'User organizations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async selectContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const isPlatformUser = req.user?.userType === 'PLATFORM';

      const context = await workspaceService.selectContext(
        userId,
        req.body,
        isPlatformUser
      );

      ResponseHelper.ok(res, context, 'Workspace context selected successfully');
    } catch (error) {
      next(error);
    }
  }

  async getCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const organizationId = req.organizationId!;
      const locationId = req.locationId;
      const isPlatformUser = req.user?.userType === 'PLATFORM';

      const context = await workspaceService.getCurrentWorkspace(
        userId,
        organizationId,
        locationId,
        isPlatformUser
      );

      ResponseHelper.ok(res, context, 'Active workspace context retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async setPrimaryOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { organizationId } = req.body;

      const updated = await workspaceService.setPrimaryOrganization(userId, organizationId);
      ResponseHelper.ok(res, updated, 'Primary organization preference updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const workspaceController = new WorkspaceController();

