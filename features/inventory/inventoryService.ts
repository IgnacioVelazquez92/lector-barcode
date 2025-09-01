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
  pesable?: number;
  pesable_por_unidad?: number;
};

export type ItemInventario = {
  id: number;
  inventario_id: number;
  ean: string;
  cantidad: number;
  ts: number;
  // join fields
  codigo_articulo?: string;
  descripcion?: string;
  unidades_por_bulto?: number;
};

export type ItemVencimiento = {
  id: number;
  inventario_id: number;
  ean: string;
  cantidad: number;
  fecha_vto: number;
  lote: string;
  ts: number;
  // join fields
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
  // @ts-ignore: expo-sqlite expone lastInsertRowId
  return res.lastInsertRowId as number;
}

export async function getInventories(): Promise<Inventario[]> {
  const db = await getDB();
  return db.getAllAsync<Inventario>(
    "SELECT id, nombre, descripcion, fecha_creacion FROM inventarios ORDER BY fecha_creacion DESC"
  );
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
    "SELECT ean, codigo_articulo, descripcion, unidades_por_bulto, pesable, pesable_por_unidad FROM articulos WHERE ean = ?",
    [ean.trim()]
  );
  return row ?? null;
}

// Listar todos los EAN asociados a un mismo código interno (PLU / codigo_articulo)
export async function findArticlesByCodigo(codigo: string): Promise<Articulo[]> {
  const db = await getDB();
  const cod = String(codigo ?? "").trim();
  if (!cod) return [];
  return db.getAllAsync<Articulo>(
    `SELECT ean, codigo_articulo, descripcion, unidades_por_bulto, pesable, pesable_por_unidad
     FROM articulos
     WHERE TRIM(codigo_articulo) = ?
     ORDER BY descripcion COLLATE NOCASE ASC`,
    [cod]
  );
}

// ---------- Items (cantidad) ----------
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
    inventarioId,
    ean.trim(),
  ]);
}

export async function getInventoryItems(inventarioId: number): Promise<ItemInventario[]> {
  const db = await getDB();
  return db.getAllAsync<ItemInventario>(
    `SELECT i.id, i.inventario_id, i.ean, i.cantidad, i.ts,
            a.codigo_articulo, a.descripcion, a.unidades_por_bulto
     FROM inventario_items i
     JOIN articulos a ON a.ean = i.ean
     WHERE i.inventario_id = ?
     ORDER BY a.descripcion COLLATE NOCASE ASC`,
    [inventarioId]
  );
}

// ---------- Items con vencimiento ----------

// (A) Operaciones básicas por (inventario_id, ean, fecha)
export async function getVtoItem(
  inventarioId: number,
  ean: string,
  fecha_vto_epoch_ms: number
): Promise<ItemVencimiento | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<ItemVencimiento>(
    "SELECT id, inventario_id, ean, cantidad, fecha_vto, lote, ts FROM inventario_vencimientos WHERE inventario_id = ? AND ean = ? AND fecha_vto = ?",
    [inventarioId, ean.trim(), fecha_vto_epoch_ms]
  );
  return row ?? null;
}

export async function setVtoItemCantidad(
  inventarioId: number,
  ean: string,
  fecha_vto_epoch_ms: number,
  cantidad: number
) {
  const db = await getDB();
  const ts = Date.now();
  await db.runAsync(
    "INSERT INTO inventario_vencimientos (inventario_id, ean, cantidad, fecha_vto, lote, ts) VALUES (?,?,?,?,?,?) " +
      "ON CONFLICT(inventario_id, ean, fecha_vto, lote) DO UPDATE SET cantidad=excluded.cantidad, ts=excluded.ts",
    [inventarioId, ean.trim(), cantidad, fecha_vto_epoch_ms, "", ts]
  );
}

export async function addToVtoItemCantidad(
  inventarioId: number,
  ean: string,
  fecha_vto_epoch_ms: number,
  delta: number
) {
  const db = await getDB();
  const current = await getVtoItem(inventarioId, ean, fecha_vto_epoch_ms);
  const nueva = Math.max(0, (current?.cantidad ?? 0) + delta);
  await setVtoItemCantidad(inventarioId, ean, fecha_vto_epoch_ms, nueva);
}

// Inserta o reemplaza (clave compuesta incluye lote vacío "")
export async function setVtoItem(
  inventarioId: number,
  ean: string,
  cantidad: number,
  fecha_vto_epoch_ms: number,
  lote: string
) {
  const db = await getDB();
  const ts = Date.now();
  await db.runAsync(
    "INSERT INTO inventario_vencimientos (inventario_id, ean, cantidad, fecha_vto, lote, ts) VALUES (?,?,?,?,?,?) " +
      "ON CONFLICT(inventario_id, ean, fecha_vto, lote) DO UPDATE SET cantidad=excluded.cantidad, ts=excluded.ts",
    [inventarioId, ean.trim(), cantidad, fecha_vto_epoch_ms, (lote ?? "").trim(), ts]
  );
}

export async function removeVtoItem(id: number) {
  const db = await getDB();
  await db.runAsync("DELETE FROM inventario_vencimientos WHERE id = ?", [id]);
}

export async function getVtoItems(inventarioId: number): Promise<ItemVencimiento[]> {
  const db = await getDB();
  return db.getAllAsync<ItemVencimiento>(
    `SELECT v.id, v.inventario_id, v.ean, v.cantidad, v.fecha_vto, v.lote, v.ts,
            a.codigo_articulo, a.descripcion, a.unidades_por_bulto
     FROM inventario_vencimientos v
     JOIN articulos a ON a.ean = v.ean
     WHERE v.inventario_id = ?
     ORDER BY v.fecha_vto ASC, a.descripcion COLLATE NOCASE ASC`,
    [inventarioId]
  );
}

// (B) Duplicados por EAN con diferentes fechas: utilidades para consolidar en una sola fila
export async function getVtoItemsByEAN(
  inventarioId: number,
  ean: string
): Promise<ItemVencimiento[]> {
  const db = await getDB();
  return db.getAllAsync<ItemVencimiento>(
    `SELECT v.id, v.inventario_id, v.ean, v.cantidad, v.fecha_vto, v.lote, v.ts,
            a.codigo_articulo, a.descripcion, a.unidades_por_bulto
     FROM inventario_vencimientos v
     JOIN articulos a ON a.ean = v.ean
     WHERE v.inventario_id = ? AND v.ean = ?
     ORDER BY v.fecha_vto ASC`,
    [inventarioId, ean.trim()]
  );
}

export async function consolidateVtoByEAN(
  inventarioId: number,
  ean: string,
  fechaToKeep: number,
  cantidadToKeep: number
) {
  const db = await getDB();
  const ts = Date.now();
  await db.execAsync("BEGIN");
  try {
    // Borra todas las filas de ese EAN menos la fecha seleccionada
    await db.runAsync(
      "DELETE FROM inventario_vencimientos WHERE inventario_id = ? AND ean = ? AND fecha_vto <> ?",
      [inventarioId, ean.trim(), fechaToKeep]
    );
    // Upsert final con la cantidad consolidada
    await db.runAsync(
      "INSERT INTO inventario_vencimientos (inventario_id, ean, cantidad, fecha_vto, lote, ts) VALUES (?,?,?,?,?,?) " +
        "ON CONFLICT(inventario_id, ean, fecha_vto, lote) DO UPDATE SET cantidad=excluded.cantidad, ts=excluded.ts",
      [inventarioId, ean.trim(), cantidadToKeep, fechaToKeep, "", ts]
    );
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }
}

// --- Stats / rename / delete ---
export type InventarioStats = Inventario & {
  items: number;
  items_cant: number; // distintos en inventario_items
  items_vto: number;  // distintos en inventario_vencimientos
  ultima_modificacion: number;
};

export async function getInventoriesWithStats(): Promise<InventarioStats[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<InventarioStats>(
    `SELECT
        inv.id, inv.nombre, inv.descripcion, inv.fecha_creacion,
        (SELECT COUNT(DISTINCT i.ean) FROM inventario_items i WHERE i.inventario_id = inv.id) AS items_cant,
        (SELECT COUNT(DISTINCT v.ean) FROM inventario_vencimientos v WHERE v.inventario_id = inv.id) AS items_vto,
        COALESCE((
          SELECT MAX(ts) FROM (
            SELECT MAX(ts) AS ts FROM inventario_items WHERE inventario_id = inv.id
            UNION ALL
            SELECT MAX(ts) AS ts FROM inventario_vencimientos WHERE inventario_id = inv.id
          )
        ), inv.fecha_creacion) AS ultima_modificacion
     FROM inventarios inv
     ORDER BY ultima_modificacion DESC`
  );
  return rows.map((r: any) => ({
    ...r,
    items_cant: Number(r.items_cant ?? 0),
    items_vto: Number(r.items_vto ?? 0),
    items: Number(r.items_cant ?? 0) + Number(r.items_vto ?? 0),
    ultima_modificacion: Number(r.ultima_modificacion ?? r.fecha_creacion),
  }));
}

export async function renameInventory(id: number, nuevoNombre: string, nuevaDesc?: string) {
  const db = await getDB();
  await db.runAsync("UPDATE inventarios SET nombre = ?, descripcion = ? WHERE id = ?", [
    nuevoNombre.trim(),
    (nuevaDesc ?? "").trim(),
    id,
  ]);
}

export async function deleteInventory(id: number) {
  const db = await getDB();
  await db.execAsync("BEGIN");
  try {
    await db.runAsync("DELETE FROM inventario_items WHERE inventario_id = ?", [id]);
    await db.runAsync("DELETE FROM inventario_vencimientos WHERE inventario_id = ?", [id]);
    await db.runAsync("DELETE FROM inventarios WHERE id = ?", [id]);
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }
}
