// src/utils/pagination.js

/** Hard ceiling on page size so a single request can never pull the table. */
export const MAX_PAGE_LIMIT = 100;

/**
 * Parses page/limit query params with sane bounds: page >= 1, and
 * 1 <= limit <= MAX_PAGE_LIMIT (an uncapped limit lets one request load
 * every row into memory).
 */
export function parsePagination(query, defaultLimit = 10) {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(query.limit) || defaultLimit, 1),
    MAX_PAGE_LIMIT
  );
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * The unified list-response meta block. Every list endpoint answers with
 * meta: { total, page, limit, totalPages } - no per-domain variants.
 */
export function paginationMeta(total, page, limit) {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}
