// features/catalog/catalogService.ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import XLSX from "xlsx";
import { getDB } from "../../db/client";

// Utilidad: limpia EAN (quita apóstrofe inicial y espacios)
const normalizeEAN = (raw: any): string => {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s;
};

// Utilidad: convierte "7,04" -> 7.04; default 1 si vacío/0/NaN
const normalizeUnits = (raw: any): number => {
  if (raw === null || raw === undefined) return 1;
  const s = String(raw).replace(",", ".").trim();
  const n = Number(s);
  if (!isFinite(n) || n <= 0) return 1;
  return n;
};

// Valida encabezados mínimos
const requiredHeaders = ["EAN", "codigo_articulo", "descripcion", "unidades_por_bulto"];

const validateHeaders = (headers: string[]) => {
  const lower = headers.map(h => String(h).trim().toLowerCase());
  for (const req of requiredHeaders) {
    if (!lower.includes(req.toLowerCase())) {
      throw new Error(`Falta columna requerida: ${req}`);
    }
  }
};

// Lee un archivo Excel desde URI (DocumentPicker) y devuelve arreglo de filas normalizadas
const parseExcelAtUri = async (uri: string) => {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const wb = XLSX.read(b64, { type: "base64" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

  if (!rows.length) return [];

  // Validar encabezados
  const firstRowKeys = Object.keys(rows[0]);
  validateHeaders(firstRowKeys);

  // Normalizar filas
  const normalized = rows.map((r) => {
    const ean = normalizeEAN(r["EAN"]);
    const codigo = String(r["codigo_articulo"] ?? "").trim();
    const descripcion = String(r["descripcion"] ?? "").trim();
    const upb = normalizeUnits(r["unidades_por_bulto"]);
    return { ean, codigo_articulo: codigo, descripcion, unidades_por_bulto: upb };
  });

  // Filtrar vacíos
  return normalized.filter((r) => r.ean && r.descripcion);
};

// Inserta en lotes para rendimiento
const insertBatch = async (
  db: Awaited<ReturnType<typeof getDB>>,
  batch: Array<{ ean: string; codigo_articulo: string; descripcion: string; unidades_por_bulto: number }>,
  ts: number
) => {
  // Usamos parámetros para evitar inyección y acelerar
  const stmt = await db.prepareAsync(
    "INSERT INTO articulos (ean, codigo_articulo, descripcion, unidades_por_bulto, ultimo_update) VALUES (?,?,?,?,?)"
  );
  try {
    await db.execAsync("BEGIN");
    for (const r of batch) {
      await stmt.executeAsync([r.ean, r.codigo_articulo, r.descripcion, r.unidades_por_bulto, ts]);
    }
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  } finally {
    await stmt.finalizeAsync();
  }
};

// Flujo principal: elegir archivo → parsear → reemplazar tabla articulos
export const pickAndImportCatalog = async (): Promise<{ total: number }> => {
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) {
    throw new Error("Usuario canceló la selección de archivo.");
  }

  const uri = res.assets[0].uri;
  const rows = await parseExcelAtUri(uri);
  const total = rows.length;
  const db = await getDB();
  const ts = Date.now();

  // Reemplazo total
  await db.execAsync("BEGIN");
  try {
    await db.execAsync("DELETE FROM articulos;");
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }

  // Insert en lotes (ajustar tamaño según perf del dispositivo)
  const BATCH = 800;
  for (let i = 0; i < total; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await insertBatch(db, slice, ts);
  }

  return { total };
};
