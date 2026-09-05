/** European decimal formatting for cost only: "," instead of "." (e.g. "1,5000"). */
const LOCALE = "de-DE";

/** Plain integer, no thousands separator (e.g. "1234", not "1.234"). */
export const fmt = (n: number): string => String(n);

export const fmtCost = (n: number): string =>
  n.toLocaleString(LOCALE, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const pad = (n: number): string => String(n).padStart(2, "0");

/** DD/MM/YYYY HH:MM:SS, in the viewer's local timezone. */
export const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
