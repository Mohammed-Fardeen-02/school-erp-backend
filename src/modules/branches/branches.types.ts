export type BranchType =
  | 'MAIN_CAMPUS'
  | 'BRANCH_CAMPUS'
  | 'ADMINISTRATIVE_HQ'
  | 'TRAINING_CENTER'
  | 'HOSTEL_FACILITY'
  | 'SPORTS_COMPLEX';

export interface BranchDto {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  locationType: BranchType;
  isMainCampus: boolean;
  isActive: boolean;
  email: string | null;
  phone: string | null;
  principalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  updatedAt: Date;
  organization?: {
    id: string;
    code: string;
    displayName: string;
    status: string;
  };
}

export interface CreateBranchDto {
  organizationId?: string;
  code?: string;
  name: string;
  locationType?: BranchType;
  isMainCampus?: boolean;
  email?: string;
  phone?: string;
  principalName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateBranchDto {
  name?: string;
  locationType?: BranchType;
  email?: string;
  phone?: string;
  principalName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface BranchQueryFilters {
  organizationId?: string;
  isActive?: boolean;
  locationType?: BranchType;
  search?: string;
  page?: number;
  limit?: number;
}

export interface BranchStatusDto {
  isActive: boolean;
}
