/**
 * Buffer polyfill for browser environment.
 * ExcelJS relies on Node.js Buffer internally; without this polyfill
 * the client-side export (wb.xlsx.writeBuffer()) will throw
 * "Buffer is not defined" in the browser.
 */
if (typeof window !== "undefined" && typeof (window as Record<string, unknown>).Buffer === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (window as Record<string, unknown>).Buffer = require("buffer/").Buffer;
}
