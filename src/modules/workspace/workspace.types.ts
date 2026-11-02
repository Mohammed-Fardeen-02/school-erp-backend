export interface SelectWorkspaceContextDto {
  organizationId: string;
  locationId?: string;
}

export interface SetPrimaryOrganizationDto {
  organizationId: string;
}

export interface WorkspaceLocationSummary {
  id: string;
  code: string;
  name: string;
  locationType: string;
  isMainCampus: boolean;
  isActive: boolean;
}

export interface UserOrganizationSummary {
  id: string;
  code: string;
  displayName: string;
  legalName: string;
  organizationType: string;
  status: string;
  logoUrl?: string | null;
  isPrimary: boolean;
  accessLevel: string;
  membershipType: string;
  campuses: WorkspaceLocationSummary[];
}

export interface WorkspaceContextResponse {
  organization: {
    id: string;
    code: string;
    displayName: string;
    legalName: string;
    organizationType: string;
    status: string;
    logoUrl?: string | null;
  };
  location?: {
    id: string;
    code: string;
    name: string;
    locationType: string;
    isMainCampus: boolean;
  };
  membership: {
    id: string;
    accessLevel: string;
    membershipType: string;
    isPrimary: boolean;
  };
  enabledModules: string[];
}

export interface MemberFilterOptions {
  search?: string;
  page?: number;
  limit?: number;
}

export interface WorkspaceMemberSummaryDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
}

export interface ListMembersResult {
  members: WorkspaceMemberSummaryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}


