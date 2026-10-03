import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { seedDemoData, type SeedSummary } from "./seed-demo";

async function main() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL_MISSING");

  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) throw new Error("SEED_INVALID_ARGUMENT");
  const dryRun = args.includes("--dry-run");
  const rollback = new Error("SEED_DRY_RUN_ROLLBACK");

  const client = postgres(url, {
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 10,
  });
  const db = drizzle(client, { schema });

  try {
    let summary: SeedSummary | undefined;
    try {
      await db.transaction(async (tx) => {
        summary = await seedDemoData(tx);
        if (dryRun) throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    console.log(dryRun
      ? "Seed próbny zakończony. Transakcja została wycofana."
      : "Seed DEMO zapisany w bazie. Wszystkie obiekty i statusy są fikcyjne.");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  // Błędy sterownika mogą zawierać adres połączenia lub parametry zapytania.
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : "SEED_FAILED";
  console.error(`Seed nie powiódł się (${code}). Sprawdź połączenie, migrację i slugi demo.`);
  process.exitCode = 1;
});
