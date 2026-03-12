import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// For query purposes (used by the app)
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

// For migrations (separate connection with max 1)
export function getMigrationClient() {
  const migrationClient = postgres(connectionString, { max: 1 });
  return drizzle(migrationClient, { schema });
}
