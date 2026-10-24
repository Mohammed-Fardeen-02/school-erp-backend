import { APP_CONSTANTS } from '../../config/constants';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function parsePaginationParams(query: {
  page?: string | number;
  limit?: string | number;
}): PaginationParams {
  const page = Math.max(1, Number(query.page) || APP_CONSTANTS.PAGINATION.DEFAULT_PAGE);
  const requestedLimit = Number(query.limit) || APP_CONSTANTS.PAGINATION.DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requestedLimit), APP_CONSTANTS.PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit) || 1;

  return {
    items,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPrevPage: params.page > 1,
    },
  };
}
