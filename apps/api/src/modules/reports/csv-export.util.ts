/**
 * CSV Export and Sanitization Utilities
 * Implements RFC 4180 compliant CSV formatting and spreadsheet formula injection neutralization.
 */

export const UTF8_BOM = "\uFEFF";

/**
 * Characters that trigger spreadsheet formula execution in Microsoft Excel, LibreOffice, or Google Sheets.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Sanitizes a single cell value for CSV output:
 * 1. Handles null, undefined, booleans, dates, and numbers.
 * 2. Protects against CSV formula injection (OWASP CSV Injection).
 * 3. Enforces RFC 4180 escaping (doubling quotes and wrapping delimiters in quotes).
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }

  if (typeof val === "boolean") {
    return val ? "TRUE" : "FALSE";
  }

  if (typeof val === "number" || typeof val === "bigint") {
    if (!Number.isFinite(val)) {
      return "";
    }
    return String(val);
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? "" : val.toISOString();
  }

  let str = String(val);

  // Check for formula injection: cells starting with =, +, -, @, \t, or \r
  // Also handle leading spaces/whitespace before the trigger character
  const trimmedLeading = str.replace(/^[ \f\v]+/, "");
  const isFormulaDangerous =
    trimmedLeading.length > 0 &&
    FORMULA_TRIGGERS.some((trigger) => trimmedLeading.startsWith(trigger));

  if (isFormulaDangerous) {
    // Prefix with single quote to force spreadsheet programs to treat as text
    str = `'${str}`;
  }

  // RFC 4180: If cell contains comma, double-quote, newline, or was formula-escaped, enclose in double-quotes
  const needsQuotes =
    isFormulaDangerous ||
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsQuotes) {
    // Double all existing double-quotes
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Formats an array of cell values as an RFC 4180 compliant CSV row terminated with CRLF (\r\n).
 */
export function formatCsvRow(cells: unknown[]): string {
  return cells.map(sanitizeCsvCell).join(",") + "\r\n";
}

/**
 * Sanitizes a string for use in a Content-Disposition filename header.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}
