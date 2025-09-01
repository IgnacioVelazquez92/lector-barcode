// db/client.ts  (asegurar columnas si la DB ya existía)
import * as SQLite from "expo-sqlite";
import { createTables } from "./schema";

let db: SQLite.SQLiteDatabase | null = null;

async function ensureArticleColumns(database: SQLite.SQLiteDatabase) {
  // Intentamos agregar columnas; si ya existen, SQLite tira error y lo ignoramos.
  const tryAdd = async (sql: string) => {
    try { await database.execAsync(sql); } catch { /* no-op si ya existe */ }
  };
  await tryAdd("ALTER TABLE articulos ADD COLUMN pesable INTEGER DEFAULT 0;");
  await tryAdd("ALTER TABLE articulos ADD COLUMN pesable_por_unidad INTEGER DEFAULT 0;");
}

export const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync("inventario.db");
    await db.execAsync(createTables);
    await ensureArticleColumns(db);
  }
  return db;
};
