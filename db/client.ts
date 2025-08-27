// db/client.ts
import * as SQLite from "expo-sqlite";
import { createTables } from "./schema";

let db: SQLite.SQLiteDatabase | null = null;

// Inicializar conexión
export const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync("inventario.db");
    await db.execAsync(createTables); // ejecuta el schema al iniciar
  }
  return db;
};
