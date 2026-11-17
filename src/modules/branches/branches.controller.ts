import { Request, Response, NextFunction } from 'express';
import { branchesService } from './branches.service';
import { ResponseHelper } from '../../core/http/response';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

export class BranchesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetOrg = (req.query.organizationId as string) || req.organizationId;
      const organizationId = targetOrg && targetOrg !== 'ALL' ? targetOrg : 'platform-control';
      const filters = {
        organizationId: targetOrg && targetOrg !== 'ALL' ? targetOrg : undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        locationType: req.query.locationType as any,
        search: req.query.search as string,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      };

      const branches = await branchesService.getBranches(organizationId, filters);
      ResponseHelper.ok(res, branches, 'Branches retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId || (req.query.organizationId as string) || 'platform-control';

      const branch = await branchesService.getBranchById(id, organizationId);
      ResponseHelper.ok(res, branch, 'Branch retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetOrg = req.body.organizationId || req.organizationId;
      if (!targetOrg || targetOrg === 'platform-control') {
        throw new AppError(
          'Target organization must be selected to create a branch.',
          400,
          ErrorCode.TENANT_CONTEXT_MISSING
        );
      }
      const actorUserId = req.user!.id;

      const branch = await branchesService.createBranch(targetOrg, req.body, actorUserId);
      ResponseHelper.created(res, branch, 'Branch created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const updated = await branchesService.updateBranch(id, organizationId, req.body, actorUserId);
      ResponseHelper.ok(res, updated, 'Branch updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async setMainBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const result = await branchesService.setMainBranch(id, organizationId, actorUserId);
      ResponseHelper.ok(res, result, 'Branch designated as main campus successfully');
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;
      const { isActive } = req.body;

      const result = await branchesService.toggleStatus(id, organizationId, isActive, actorUserId);
      ResponseHelper.ok(res, result, `Branch ${isActive ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const result = await branchesService.deleteBranch(id, organizationId, actorUserId);
      ResponseHelper.ok(res, result, 'Branch deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const branchesController = new BranchesController();
