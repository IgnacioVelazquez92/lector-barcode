// features/inventory/scale.ts
import { getDB } from "../../db/client";

/**
 * Detección de tickets de balanza y PLU empaquetado
 * - 20/21 + PLU(5) + peso(5/6) [+ checksum]: ej "2100510006657"
 *   prefijo=20/21, PLU=00510 -> 510, peso=006657 -> 0.6657 kg (heurística /10000)
 * - "0000000000PLU" (13 dígitos con PLU al final) => buscar por PLU
 */

export function isScaleBarcode(raw: string) {
  const s = (raw || "").trim();
  return s.startsWith("20") || s.startsWith("21");
}

export function isPluPackedBarcode(raw: string) {
  // 13 dígitos, 10 ceros y 3–5 dígitos finales como PLU
  const s = (raw || "").trim();
  return /^0{10}\d{3,5}$/.test(s);
}

export function parseScaleBarcode(raw: string): { plu: string; weightKg?: number } | null {
  const s = (raw || "").trim();
  if (!isScaleBarcode(s) || s.length < 8) return null;

  // PLU: tomamos 5 dígitos tras el prefijo
  const pluPadded = s.slice(2, 7);
  if (!/^\d{5}$/.test(pluPadded)) return null;
  const plu = String(Number(pluPadded)); // quita ceros a la izquierda

  // Peso: probamos 6 dígitos, si no 5, si no últimos 4
  const weight6 = s.slice(7, 13);
  const weight5 = s.slice(7, 12);

  let weightKg: number | undefined;
  if (/^\d{6}$/.test(weight6)) {
    weightKg = Number(weight6) / 10000; // heurística común
  } else if (/^\d{5}$/.test(weight5)) {
    weightKg = Number(weight5) / 1000;
  } else {
    const last4 = s.slice(-4);
    if (/^\d{4}$/.test(last4)) weightKg = Number(last4) / 10000;
  }

  return { plu, weightKg };
}

/** Convierte a EAN base de balanza "2100PLU000000" o "2000PLU000000" */
export function toBaseScaleEAN(raw: string): string | null {
  const s = (raw || "").trim();
  if (!isScaleBarcode(s)) return null;
  const prefix = s.slice(0, 2);    // "20" o "21"
  const pluPadded = s.slice(2, 7); // 5 dígitos
  if (!/^\d{5}$/.test(pluPadded)) return null;
  return `${prefix}0${pluPadded}000000`; // ej: 21 + 0 + 00510 + 000000 => 2100510000000
}

/** Buscar artículo por PLU (codigo_articulo) */
export async function findArticleByPLU(plu: string) {
  const db = await getDB();
  const row = await db.getFirstAsync<any>(
    "SELECT ean, codigo_articulo, descripcion, unidades_por_bulto, pesable, pesable_por_unidad FROM articulos WHERE codigo_articulo = ?",
    [String(plu).trim()]
  );
  return row ?? null;
}
