import { AuthenticatedUser, RequestContextData, OrganizationMembershipContext } from './common.types';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthenticatedUser;
      organizationId?: string;
      locationId?: string;
      schoolId?: string;
      membership?: OrganizationMembershipContext;
      context?: RequestContextData;
    }
  }
}

export {};
