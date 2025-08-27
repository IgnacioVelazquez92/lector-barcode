// features/inventory/inventoryService.ts
import { getDB } from "../../db/client";

export type Inventario = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  fecha_creacion: number;
};

export type Articulo = {
  ean: string;
  codigo_articulo: string;
  descripcion: string;
  unidades_por_bulto: number;
};

export type ItemInventario = {
  id: number;
  inventario_id: number;
  ean: string;
  cantidad: number;
  ts: number;
  // campos del join
  codigo_articulo?: string;
  descripcion?: string;
  unidades_por_bulto?: number;
};

// ---------- Inventarios ----------
export async function createInventory(nombre: string, descripcion?: string) {
  const db = await getDB();
  const fecha = Date.now();
  const res = await db.runAsync(
    "INSERT INTO inventarios (nombre, descripcion, fecha_creacion) VALUES (?,?,?)",
    [nombre.trim(), (descripcion ?? "").trim(), fecha]
  );
  // @ts-ignore: rowid disponible en expo-sqlite
  return res.lastInsertRowId as number;
}

export async function getInventories(): Promise<Inventario[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Inventario>(
    "SELECT id, nombre, descripcion, fecha_creacion FROM inventarios ORDER BY fecha_creacion DESC"
  );
  return rows;
}

export async function getInventoryById(id: number): Promise<Inventario | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<Inventario>(
    "SELECT id, nombre, descripcion, fecha_creacion FROM inventarios WHERE id = ?",
    [id]
  );
  return row ?? null;
}

// ---------- Artículos ----------
export async function findArticleByEAN(ean: string): Promise<Articulo | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<Articulo>(
    "SELECT ean, codigo_articulo, descripcion, unidades_por_bulto FROM articulos WHERE ean = ?",
    [ean.trim()]
  );
  return row ?? null;
}

// ---------- Items de inventario ----------
export async function getItem(inventarioId: number, ean: string): Promise<ItemInventario | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<ItemInventario>(
    "SELECT id, inventario_id, ean, cantidad, ts FROM inventario_items WHERE inventario_id = ? AND ean = ?",
    [inventarioId, ean.trim()]
  );
  return row ?? null;
}

export async function setItemCantidad(inventarioId: number, ean: string, cantidad: number) {
  const db = await getDB();
  const ts = Date.now();
  // ON CONFLICT REPLACE por UNIQUE(inventario_id, ean)
  await db.runAsync(
    "INSERT INTO inventario_items (inventario_id, ean, cantidad, ts) VALUES (?,?,?,?) " +
    "ON CONFLICT(inventario_id, ean) DO UPDATE SET cantidad=excluded.cantidad, ts=excluded.ts",
    [inventarioId, ean.trim(), cantidad, ts]
  );
}

export async function addToItemCantidad(inventarioId: number, ean: string, delta: number) {
  const db = await getDB();
  const current = await getItem(inventarioId, ean);
  const nueva = Math.max(0, (current?.cantidad ?? 0) + delta);
  await setItemCantidad(inventarioId, ean, nueva);
}

export async function removeItem(inventarioId: number, ean: string) {
  const db = await getDB();
  await db.runAsync("DELETE FROM inventario_items WHERE inventario_id = ? AND ean = ?", [
    inventarioId, ean.trim(),
  ]);
}

export async function getInventoryItems(inventarioId: number): Promise<ItemInventario[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<ItemInventario>(
    `SELECT i.id, i.inventario_id, i.ean, i.cantidad, i.ts,
            a.codigo_articulo, a.descripcion, a.unidades_por_bulto
     FROM inventario_items i
     JOIN articulos a ON a.ean = i.ean
     WHERE i.inventario_id = ?
     ORDER BY a.descripcion COLLATE NOCASE ASC`,
    [inventarioId]
  );
  return rows;
}


// --- NUEVO: stats de inventarios, renombrar y eliminar ---
export type InventarioStats = Inventario & {
  items: number;
  ultima_modificacion: number;
};

export async function getInventoriesWithStats(): Promise<InventarioStats[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<InventarioStats>(
    `SELECT inv.id, inv.nombre, inv.descripcion, inv.fecha_creacion,
            COUNT(i.id) AS items,
            COALESCE(MAX(i.ts), inv.fecha_creacion) AS ultima_modificacion
     FROM inventarios inv
     LEFT JOIN inventario_items i ON i.inventario_id = inv.id
     GROUP BY inv.id
     ORDER BY ultima_modificacion DESC`
  );
  // SQLite devuelve COUNT como number|string según plataforma -> normalizamos
  return rows.map(r => ({
    ...r,
    items: Number(r.items ?? 0),
    ultima_modificacion: Number(r.ultima_modificacion ?? r.fecha_creacion),
  }));
}

export async function renameInventory(id: number, nuevoNombre: string, nuevaDesc?: string) {
  const db = await getDB();
  await db.runAsync(
    "UPDATE inventarios SET nombre = ?, descripcion = ? WHERE id = ?",
    [nuevoNombre.trim(), (nuevaDesc ?? "").trim(), id]
  );
}

export async function deleteInventory(id: number) {
  const db = await getDB();
  await db.execAsync("BEGIN");
  try {
    await db.runAsync("DELETE FROM inventario_items WHERE inventario_id = ?", [id]);
    await db.runAsync("DELETE FROM inventarios WHERE id = ?", [id]);
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }
}
