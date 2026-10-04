export function normalizePolishPostcode(value: string | null | undefined): string | null {
  const code = value?.trim();
  if (!code) return null;
  if (/^\d{2}-\d{3}$/.test(code)) return code;
  return /^\d{5}$/.test(code) ? `${code.slice(0, 2)}-${code.slice(2)}` : null;
}
