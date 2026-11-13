import { Request, Response, NextFunction } from 'express';
import { settingsService } from './settings.service';
import { ResponseHelper } from '../../core/http/response';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

export class SettingsController {
  private resolveOrganizationId(req: Request): string {
    const isPlatformUser = req.user?.userType === 'PLATFORM' || req.user?.roles?.includes('SUPER_ADMIN');
    const paramOrgId = req.params.organizationId;
    const headerOrgId = req.headers['x-organization-id'] as string;
    const contextOrgId = req.organizationId;

    if (paramOrgId) {
      if (!isPlatformUser && contextOrgId && contextOrgId !== paramOrgId) {
        throw AppError.forbidden('Cross-tenant settings access forbidden', ErrorCode.TENANT_ACCESS_DENIED);
      }
      return paramOrgId;
    }

    if (contextOrgId) {
      return contextOrgId;
    }

    if (headerOrgId) {
      return headerOrgId;
    }

    if (isPlatformUser) {
      return 'platform-control';
    }

    throw AppError.badRequest('Organization context is missing', ErrorCode.TENANT_CONTEXT_MISSING);
  }

  async getConfiguration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = this.resolveOrganizationId(req);
      const config = await settingsService.getConfiguration(orgId);
      ResponseHelper.ok(res, config, 'Tenant configuration retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateConfiguration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = this.resolveOrganizationId(req);
      const actorUserId = req.user?.id;
      const updated = await settingsService.updateConfiguration(orgId, req.body, actorUserId);
      ResponseHelper.ok(res, updated, 'Tenant configuration updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async sendTestEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = this.resolveOrganizationId(req);
      const actorUserId = req.user?.id;
      const result = await settingsService.sendTestEmail(orgId, req.body, actorUserId);
      ResponseHelper.ok(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  async testStorage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = this.resolveOrganizationId(req);
      const result = await settingsService.testStorage(orgId, req.body);
      ResponseHelper.ok(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  async testRazorpay(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = this.resolveOrganizationId(req);
      const result = await settingsService.testRazorpay(orgId, req.body);
      ResponseHelper.ok(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
