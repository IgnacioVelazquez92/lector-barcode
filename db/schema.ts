// db/schema.ts
export const createTables = `
CREATE TABLE IF NOT EXISTS articulos (
  ean TEXT PRIMARY KEY,
  codigo_articulo TEXT,
  descripcion TEXT,
  unidades_por_bulto REAL DEFAULT 1,
  pesable INTEGER DEFAULT 0,
  pesable_por_unidad INTEGER DEFAULT 0,
  ultimo_update INTEGER
);

CREATE INDEX IF NOT EXISTS idx_articulos_codigo ON articulos(codigo_articulo);

CREATE TABLE IF NOT EXISTS inventarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  fecha_creacion INTEGER
);

CREATE TABLE IF NOT EXISTS inventario_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_id INTEGER NOT NULL,
  ean TEXT NOT NULL,
  cantidad REAL NOT NULL,
  ts INTEGER,
  UNIQUE(inventario_id, ean) ON CONFLICT REPLACE
);

CREATE INDEX IF NOT EXISTS idx_items_inventario ON inventario_items(inventario_id);

/* NUEVO: ítems con fecha de vencimiento */
CREATE TABLE IF NOT EXISTS inventario_vencimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_id INTEGER NOT NULL,
  ean TEXT NOT NULL,
  cantidad REAL NOT NULL,
  fecha_vto INTEGER NOT NULL,   -- epoch ms (00:00 local del día)
  lote TEXT DEFAULT '',
  ts INTEGER,
  UNIQUE(inventario_id, ean, fecha_vto, lote) ON CONFLICT REPLACE
);

CREATE INDEX IF NOT EXISTS idx_vto_inventario ON inventario_vencimientos(inventario_id);
`;
