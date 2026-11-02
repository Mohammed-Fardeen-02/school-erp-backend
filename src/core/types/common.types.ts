export interface AuthenticatedUser {
  id: string;
  email: string;
  userType?: 'PLATFORM' | 'TENANT';
  tokenVersion?: number;
  sessionId?: string;
  roles: string[];
  permissions: string[];
  organizationId?: string;
  locationId?: string;
  schoolId?: string;
  branchId?: string;
}

export interface OrganizationMembershipContext {
  id: string;
  userId: string;
  organizationId: string;
  accessLevel: 'OWNER' | 'ADMIN' | 'MEMBER';
  membershipType: 'STAFF' | 'FACULTY' | 'STUDENT' | 'GUARDIAN' | 'TRUSTEE' | 'CONSULTANT';
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  jobTitle?: string | null;
  department?: string | null;
  isPrimary: boolean;
}

export interface RequestContextData {
  requestId: string;
  organizationId?: string;
  locationId?: string;
  schoolId?: string;
  user?: AuthenticatedUser;
  startTime: number;
}
