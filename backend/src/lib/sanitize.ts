/**
 * Input sanitizers for values that flow into query builders.
 */

/**
 * Sanitize a user-supplied search term before interpolating it into a
 * PostgREST `.or(...)` filter string.
 *
 * PostgREST parses the `.or()` argument as its own filter DSL, using commas,
 * parentheses and `.` as structural separators. Interpolating raw user input
 * lets a caller inject extra filter conditions (filter injection). We strip the
 * structural characters (`% , ( )`) — none of which are meaningful inside an
 * `ilike` search term — leaving a safe substring to match against.
 */
export function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()]/g, ' ').trim();
}
