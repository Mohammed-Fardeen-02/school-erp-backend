import { AuthenticatedUser, RequestContextData } from './common.types';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthenticatedUser;
      schoolId?: string;
      context?: RequestContextData;
    }
  }
}

export {};
