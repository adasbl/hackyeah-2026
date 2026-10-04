/** Store simple restrictions as data, not the website's expressive wording. */
export function factConditions(value: string): string | null {
  let rest = value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/ł/g, 'l');
  const parts: string[] = [];
  rest = rest.replace(/\b(plus|classic|light|student|senior|kids)\b/g, (_, variant: string) => {
    parts.push(`Wariant: ${variant[0].toUpperCase()}${variant.slice(1)}`); return '';
  });
  rest = rest.replace(/\bdoplat\w*\s*(?:wynosi\s+|w wysokosci\s+)?[:=]?\s*(\d+(?:[,.]\d{1,2})?)\s*(?:zl|pln)\b/g, (_, price: string) => {
    parts.push(`Dopłata: ${price} PLN`); return '';
  });
  rest = rest.replace(/\b(?:limit(?: czasu)?\s*)?(\d+)\s+minut\w*\b/g, (_, minutes: string) => {
    parts.push(`Czas: ${minutes} min`); return '';
  });
  rest = rest.replace(/\b(?:wymagana rezerwacja|rezerwacja (?:jest )?wymagana|z rezerwacja)\b/g, () => {
    parts.push('Rezerwacja: wymagana'); return '';
  });
  if (/\b(?:tylko|wylacznie)\b/.test(rest)) parts.push('Ograniczenie do wskazanego wariantu');
  rest = rest.replace(/\b(?:multi[\s-]?sport|be[\s-]?active|medicover\s+sport|pzu\s+sport|honorujemy|akceptujemy|przyjmujemy|obslugujemy|respektujemy|karty|karte|karta|kart|z|za|na|i|oraz|tylko|wylacznie)\b/g, '');
  // An unrecognized day, time, extra amount, condition or service must not disappear.
  if (!parts.length || rest.replace(/[\s.,;:\-]/g, '')) return null;
  return [...new Set(parts)].join('; ');
}
