export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  schoolId?: string;
  branchId?: string;
}

export interface RequestContextData {
  requestId: string;
  schoolId?: string;
  user?: AuthenticatedUser;
  startTime: number;
}
