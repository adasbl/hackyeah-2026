/**
 * Kopiuje worker MapLibre GL (v6) do public/maplibre/, żeby przeglądarka mogła go pobrać.
 * MapLibre v6 szuka workera obok własnego pliku (import.meta.url), czego bundler Next.js nie obsługuje,
 * więc wskazujemy go ręcznie przez setWorkerUrl('/maplibre/maplibre-gl-worker.mjs') w places-map.tsx.
 * Uruchamiane po instalacji oraz przed buildem (postinstall i prebuild). Pliki są w .gitignore.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../node_modules/maplibre-gl/dist/', import.meta.url));
const dest = fileURLToPath(new URL('../public/maplibre/', import.meta.url));
// Worker importuje ./maplibre-gl-shared.mjs, więc oba pliki muszą leżeć obok siebie.
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(src)) {
  console.error('[maplibre] Brak node_modules/maplibre-gl – uruchom npm ci przed buildem.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const file of files) copyFileSync(src + file, dest + file);
console.log(`[maplibre] Skopiowano worker do public/maplibre/ (${files.join(', ')})`);
