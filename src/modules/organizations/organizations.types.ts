import { ModuleId } from '../../shared/constants/modules';

export type OrganizationType =
  | 'K12_SCHOOL_CHAIN'
  | 'INDEPENDENT_SCHOOL'
  | 'COLLEGE_UNIVERSITY'
  | 'POLYTECHNIC_INSTITUTE'
  | 'VOCATIONAL_CENTER';

export type TenantStatus =
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'TRIAL'
  | 'ARCHIVED';

export interface CreateOrganizationDto {
  code: string;
  legalName: string;
  displayName: string;
  organizationType?: OrganizationType;
  email: string;
  phone: string;
  website?: string;
  taxId?: string;
  registrationNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  currency?: string;
  subscriptionPlan?: string;
  maxLocations?: number;
  maxUsers?: number;
  maxStudents?: number;
  trialDays?: number;
  logoUrl?: string;
  brandColor?: string;
  initialMainCampusName?: string;
  initialMainCampusCode?: string;
  ownerEmail?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
}

export interface UpdateOrganizationDto {
  displayName?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  registrationNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  currency?: string;
  logoUrl?: string;
  brandColor?: string;
}

export interface UpdateTenantStatusDto {
  status: TenantStatus;
  reason?: string;
}

export interface UpdateModulesDto {
  modules: ModuleId[];
}

export interface OrganizationQueryFilters {
  search?: string;
  status?: TenantStatus;
  page?: number;
  limit?: number;
}

