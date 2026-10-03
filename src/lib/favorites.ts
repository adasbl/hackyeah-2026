'use client';

/**
 * Ulubione obiekty – lista slugów w localStorage tej przeglądarki (bez konta i bez serwera).
 * useSyncExternalStore: wszystkie serduszka i licznik w nagłówku odświeżają się razem,
 * także między kartami przeglądarki (zdarzenie `storage`).
 * Każdy dostęp do localStorage jest w try/catch – w trybie prywatnym lub przy zablokowanych
 * danych witryny lista po prostu jest pusta, a strona działa dalej.
 */
import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'fpf:favorites';
const CHANGE_EVENT = 'fpf:favorites-change';
const EMPTY: readonly string[] = Object.freeze([]);

let cachedRaw: string | null = null;
let cachedList: readonly string[] = EMPTY;

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  // Ta sama referencja, dopóki zawartość się nie zmieni – wymóg useSyncExternalStore.
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(parsed) ? Object.freeze(parsed.filter((s): s is string => typeof s === 'string')) : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // brak miejsca / zablokowane – ignorujemy, serduszko po prostu nie zapamięta stanu
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Na serwerze (i w pierwszym renderze po stronie klienta) lista jest pusta – brak błędów hydratacji. */
const getServerSnapshot = () => EMPTY;

/** null = jeszcze nie odczytano (render serwerowy / hydratacja). */
const getHydratedFlag = () => true;
const getServerFlag = () => false;
const noopSubscribe = () => () => {};

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, read, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, getHydratedFlag, getServerFlag);

  const toggle = useCallback((slug: string) => {
    const list = read();
    write(list.includes(slug) ? list.filter((s) => s !== slug) : [slug, ...list]);
  }, []);
  const remove = useCallback((slug: string) => write(read().filter((s) => s !== slug)), []);
  const clear = useCallback(() => write([]), []);

  return { favorites, ready, toggle, remove, clear, has: (slug: string) => favorites.includes(slug) };
}
