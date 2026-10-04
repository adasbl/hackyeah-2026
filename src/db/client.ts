import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Brak DATABASE_URL w .env.local");
}

/** Lokalny Postgres z docker-compose nie ma SSL; baza w chmurze (Supabase) go wymaga. */
function isLocalDatabase(url: string) {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Zachowujemy klienta podczas przeładowań aplikacji w trybie dev.
const globalForDb = globalThis as unknown as {
  postgresClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.postgresClient ??
  postgres(databaseUrl, {
    ssl: isLocalDatabase(databaseUrl) ? false : "require",
    // Transaction pooler (Supavisor) nie obsługuje nazwanych prepared statements.
    prepare: false,
    // Bez prepared statements każde zapytanie z parametrami to dwie wymiany z bazą i blokuje połączenie.
    // Przy max: 1 wszystkie zapytania wszystkich równoległych żądań instancji czekały w jednej kolejce
    // (strona główna wysyłała ich kilkadziesiąt), więc strony potrafiły wisieć dziesiątki sekund.
    // Kilka połączeń pozwala wykonywać niezależne zapytania równolegle.
    max: 5,
    connect_timeout: 15,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresClient = client;
}

export const db = drizzle(client, { schema });
