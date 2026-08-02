export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

// Standard cursor-pagination pattern for Prisma: fetch limit+1 rows ordered by id,
// use the extra row to detect whether there's a next page, and return its id as the cursor.
export function paginateResults<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}

export interface CursorArgs {
  take: number;
  skip?: number;
  cursor?: { id: string };
}

// Prisma findMany args for cursor pagination — spread into the query.
// Always returns the same shape (skip/cursor optional-but-present as undefined)
// so it unifies cleanly with Prisma's per-model WhereUniqueInput without callers
// needing to cast the result themselves.
export function cursorArgs(cursor: string | undefined, limit: number): CursorArgs {
  return cursor
    ? { take: limit + 1, skip: 1, cursor: { id: cursor } }
    : { take: limit + 1, skip: undefined, cursor: undefined };
}
