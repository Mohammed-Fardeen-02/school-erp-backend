export type LocationType =
  | 'MAIN_CAMPUS'
  | 'BRANCH_CAMPUS'
  | 'ADMINISTRATIVE_HQ'
  | 'TRAINING_CENTER'
  | 'HOSTEL_FACILITY'
  | 'SPORTS_COMPLEX';

export interface CreateLocationDto {
  code: string;
  name: string;
  locationType?: LocationType;
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

export interface UpdateLocationDto {
  name?: string;
  locationType?: LocationType;
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

export interface LocationStatusDto {
  isActive: boolean;
  reason?: string;
}

export interface LocationQueryFilters {
  isActive?: boolean;
  locationType?: LocationType;
  search?: string;
}

