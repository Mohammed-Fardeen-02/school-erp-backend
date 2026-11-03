import { Request, Response, NextFunction } from 'express';
import { locationsService } from './locations.service';
import { ResponseHelper } from '../../core/http/response';

export class LocationsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const filters = {
        isActive:
          req.query.isActive !== undefined
            ? req.query.isActive === 'true'
            : undefined,
        locationType: req.query.locationType as any,
        search: req.query.search as string,
      };

      const locations = await locationsService.getLocations(organizationId, filters);
      ResponseHelper.ok(res, locations, 'Campuses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;

      const location = await locationsService.getLocationById(id, organizationId);
      ResponseHelper.ok(res, location, 'Campus retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const location = await locationsService.createLocation(
        organizationId,
        req.body,
        actorUserId
      );

      ResponseHelper.created(res, location, 'Campus created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const updated = await locationsService.updateLocation(
        id,
        organizationId,
        req.body,
        actorUserId
      );

      ResponseHelper.ok(res, updated, 'Campus updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async setMainCampus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const result = await locationsService.setMainCampus(
        organizationId,
        id,
        actorUserId
      );

      ResponseHelper.ok(res, result, 'Designated as main campus successfully');
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const organizationId = req.organizationId!;
      const actorUserId = req.user!.id;

      const result = await locationsService.toggleStatus(
        id,
        organizationId,
        req.body.isActive,
        actorUserId
      );

      ResponseHelper.ok(
        res,
        result,
        `Campus ${req.body.isActive ? 'activated' : 'deactivated'} successfully`
      );
    } catch (error) {
      next(error);
    }
  }
}

export const locationsController = new LocationsController();

