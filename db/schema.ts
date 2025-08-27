// db/schema.ts

export const createTables = `
CREATE TABLE IF NOT EXISTS articulos (
  ean TEXT PRIMARY KEY,
  codigo_articulo TEXT,
  descripcion TEXT,
  unidades_por_bulto REAL DEFAULT 1,
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
`;
