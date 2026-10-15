/** Number of pages needed to list `total` items at `pageSize` per page. */
export function pageCount(total, pageSize) {
  return Math.floor(total / pageSize);
}

/** 0-based index of the first item on `page` (pages are 0-based too). */
export function firstIndex(page, pageSize) {
  return page * pageSize + 1;
}
