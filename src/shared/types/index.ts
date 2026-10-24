export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantScopedEntity extends BaseEntity {
  schoolId: string;
}

export interface SoftDeletableEntity {
  isDeleted: boolean;
  deletedAt?: Date | null;
}
