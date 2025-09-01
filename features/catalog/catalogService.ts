// features/catalog/catalogService.ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import XLSX from "xlsx";
import { getDB } from "../../db/client";

// ---------- Normalizadores ----------
const normalizeEAN = (raw: any): string => {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s;
};

const normalizeUnits = (raw: any): number => {
  const s = String(raw ?? "").replace(",", ".").trim();
  const n = Number(s);
  return !isFinite(n) || n <= 0 ? 1 : n;
};

const normalizeBool01 = (raw: any): number => (String(raw ?? "").trim() === "1" ? 1 : 0);

// Quita acentos y preserva guiones bajos
const stripDiacritics = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // sin \p{Diacritic}

const toSlug = (h: string) =>
  stripDiacritics(String(h))
    .toLowerCase()
    .replace(/[\s-]+/g, "_") // espacios/guiones -> _
    .replace(/_+/g, "_")
    .replace(/[^a-z0-9_]/g, "") // preserva _
    .replace(/^_+|_+$/g, "");

// Mapa canónico -> variantes aceptadas
const headerMap: Record<string, string[]> = {
  ean: ["ean"],
  codigo_articulo: ["codigo_articulo", "codigo", "codarticulo", "codigo_interno", "plu"],
  descripcion: ["descripcion", "descripción", "desc"],
  unidades_por_bulto: ["unidades_por_bulto", "unidades_por_paquete", "uxb", "unidades_paquete", "unidadesxbolsa"],
  pesable: ["pesable"],
  pesable_por_unidad: ["pesable_x_un", "pesable_por_unidad", "pesablexun", "pesable_x_unidad"],
};

// Construye un objeto { slug: valor } para acceder robusto a cada fila
function slugRow(row: any) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) {
    out[toSlug(k)] = row[k];
  }
  return out;
}

// Devuelve el valor de la columna canónica, buscando por variantes
function pick(row: any, canonical: keyof typeof headerMap) {
  const srow = slugRow(row);
  for (const variant of headerMap[canonical]) {
    if (variant in srow) return srow[variant];
    if (variant in row) return row[variant];
  }
  return undefined;
}

const requiredCanonicals = ["ean", "codigo_articulo", "descripcion", "unidades_por_bulto"] as const;

const validateHeadersFlexible = (rows: any[]) => {
  if (!rows.length) return;
  const missing: string[] = [];
  for (const key of requiredCanonicals) {
    const sample = pick(rows[0], key);
    if (sample === undefined) missing.push(key);
  }
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}`);
};

// ---------- Parseo del Excel ----------
const parseExcelAtUri = async (uri: string) => {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const wb = XLSX.read(b64, { type: "base64" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

  if (!rows.length) return [];
  validateHeadersFlexible(rows);

  const normalized = rows.map((r) => {
    const ean = normalizeEAN(pick(r, "ean"));
    const codigo = String(pick(r, "codigo_articulo") ?? "").trim();
    const descripcion = String(pick(r, "descripcion") ?? "").trim();
    const upb = normalizeUnits(pick(r, "unidades_por_bulto"));
    const pesable = normalizeBool01(pick(r, "pesable"));
    const pesable_por_unidad = normalizeBool01(pick(r, "pesable_por_unidad"));
    return { ean, codigo_articulo: codigo, descripcion, unidades_por_bulto: upb, pesable, pesable_por_unidad };
  });

  // Filtrar filas sin EAN o sin descripción
  return normalized.filter((r) => r.ean && r.descripcion);
};

// ---------- Inserción por lotes ----------
const insertBatch = async (
  db: Awaited<ReturnType<typeof getDB>>,
  batch: Array<{
    ean: string;
    codigo_articulo: string;
    descripcion: string;
    unidades_por_bulto: number;
    pesable: number;
    pesable_por_unidad: number;
  }>,
  ts: number
) => {
  const stmt = await db.prepareAsync(
    "INSERT INTO articulos (ean, codigo_articulo, descripcion, unidades_por_bulto, pesable, pesable_por_unidad, ultimo_update) VALUES (?,?,?,?,?,?,?)"
  );
  try {
    await db.execAsync("BEGIN");
    for (const r of batch) {
      await stmt.executeAsync([
        r.ean,
        r.codigo_articulo,
        r.descripcion,
        r.unidades_por_bulto,
        r.pesable,
        r.pesable_por_unidad,
        ts,
      ]);
    }
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  } finally {
    await stmt.finalizeAsync();
  }
};

// ---------- Flujo principal ----------
export const pickAndImportCatalog = async (): Promise<{ total: number }> => {
  const res = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) throw new Error("Usuario canceló la selección de archivo.");

  const uri = res.assets[0].uri;
  const rows = await parseExcelAtUri(uri);
  const total = rows.length;
  const db = await getDB();
  const ts = Date.now();

  await db.execAsync("BEGIN");
  try {
    await db.execAsync("DELETE FROM articulos;");
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }

  const BATCH = 800;
  for (let i = 0; i < total; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    await insertBatch(db, slice, ts);
  }
  return { total };
};
