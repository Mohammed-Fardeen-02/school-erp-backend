import { describe, it, expect, vi } from 'vitest';
import { requireTenantAccessLevel, requireTenantAdmin, requireTenantOwner } from './tenant-admin';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

describe('Tenant Admin Access Level Middleware (Phase 2)', () => {
  const createMockReq = (userType: 'PLATFORM' | 'TENANT', accessLevel?: 'OWNER' | 'ADMIN' | 'MEMBER'): Request => {
    return {
      user: {
        id: 'user-123',
        email: 'user@example.com',
        userType,
        roles: [],
        permissions: [],
      },
      membership: accessLevel
        ? {
            id: 'mem-123',
            userId: 'user-123',
            organizationId: 'org-123',
            accessLevel,
            membershipType: 'STAFF',
            status: 'ACTIVE',
            isPrimary: true,
          }
        : undefined,
    } as unknown as Request;
  };

  const mockRes = {} as Response;

  it('should allow Platform Super Admins to bypass access level checks', () => {
    const req = createMockReq('PLATFORM');
    const next = vi.fn();

    requireTenantAdmin(req, mockRes, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should allow Tenant OWNER for requireTenantAdmin and requireTenantOwner', () => {
    const req = createMockReq('TENANT', 'OWNER');
    const nextAdmin = vi.fn();
    const nextOwner = vi.fn();

    requireTenantAdmin(req, mockRes, nextAdmin);
    expect(nextAdmin).toHaveBeenCalledWith();

    requireTenantOwner(req, mockRes, nextOwner);
    expect(nextOwner).toHaveBeenCalledWith();
  });

  it('should allow Tenant ADMIN for requireTenantAdmin, but block for requireTenantOwner', () => {
    const req = createMockReq('TENANT', 'ADMIN');
    const nextAdmin = vi.fn();
    const nextOwner = vi.fn();

    requireTenantAdmin(req, mockRes, nextAdmin);
    expect(nextAdmin).toHaveBeenCalledWith();

    requireTenantOwner(req, mockRes, nextOwner);
    expect(nextOwner).toHaveBeenCalledWith(expect.any(AppError));
    const error = nextOwner.mock.calls[0][0] as AppError;
    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('should block Tenant MEMBER for requireTenantAdmin', () => {
    const req = createMockReq('TENANT', 'MEMBER');
    const next = vi.fn();

    requireTenantAdmin(req, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0][0] as AppError;
    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('should throw internal server error if membership context is missing', () => {
    const req = createMockReq('TENANT'); // no membership
    const next = vi.fn();

    requireTenantAdmin(req, mockRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0][0] as AppError;
    expect(error.statusCode).toBe(500);
  });
});

