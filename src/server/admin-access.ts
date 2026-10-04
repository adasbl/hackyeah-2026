import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

export async function isAdmin(database: Pick<PostgresJsDatabase<typeof schema>, 'select'>, userId: string) {
  const [admin] = await database.select({ id: schema.adminUsers.userId }).from(schema.adminUsers)
    .where(and(eq(schema.adminUsers.userId, userId), eq(schema.adminUsers.isActive, true))).limit(1);
  return !!admin;
}
