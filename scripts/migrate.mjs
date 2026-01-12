/**
 * Production migration script using drizzle-orm migrator
 * Plain JS so it works without tsx in production
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function main() {
  console.log("Running migrations...");

  // Use { max: 1, idle_timeout: 0 } for quick exit
  const sql = postgres(connectionString, { max: 1, idle_timeout: 0 });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations complete!");
  } finally {
    // Force close connection and exit immediately
    await sql.end({ timeout: 1 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
