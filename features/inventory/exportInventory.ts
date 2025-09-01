// features/inventory/exportInventory.ts
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import XLSX from "xlsx";
import { getDB } from "../../db/client";

type Row = {
  ean: string;
  codigo_articulo: string;
  descripcion: string;
  unidades_por_bulto: number;
  cantidad: number;
  ts?: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtDateTime = (ts: number) => {
  const d = new Date(ts);
  return `${fmtDate(ts)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

async function getInventoryMeta(inventarioId: number) {
  const db = await getDB();
  return db.getFirstAsync<{ id: number; nombre: string; descripcion: string; fecha_creacion: number }>(
    "SELECT id, nombre, COALESCE(descripcion,'') as descripcion, fecha_creacion FROM inventarios WHERE id = ?",
    [inventarioId]
  );
}

/** Exporta inventario NORMAL con columnas unificadas.
 * Última columna: "fecha de vencimiento" (vacía aquí).
 */
export async function exportInventoryToExcel(inventarioId: number) {
  const db = await getDB();

  const rows = await db.getAllAsync<Row>(
    `SELECT i.ean,
            a.codigo_articulo,
            a.descripcion,
            COALESCE(a.unidades_por_bulto, 1) as unidades_por_bulto,
            i.cantidad,
            i.ts
     FROM inventario_items i
     JOIN articulos a ON a.ean = i.ean
     WHERE i.inventario_id = ?
     ORDER BY a.descripcion COLLATE NOCASE ASC`,
    [inventarioId]
  );

  if (!rows || rows.length === 0) {
    throw new Error("Este inventario no tiene ítems para exportar.");
  }

  const data = rows.map((r) => {
    const upb = Math.max(1, Number(r.unidades_por_bulto ?? 1));
    const cantidad = Number(r.cantidad ?? 0);
    const bultos = Math.floor(cantidad / upb);
    return {
      ean: r.ean,
      "codigo articulo": r.codigo_articulo,
      descripcion: r.descripcion,
      "unidades por bulto": upb,
      bultos,
      cantidad,
      "fecha de ingreso": r.ts ? fmtDateTime(r.ts) : "",
      "fecha de vencimiento": "", // SIEMPRE última columna (vacía en inventario normal)
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "inventario");

  // Hoja Resumen
  const meta = await getInventoryMeta(inventarioId);
  const resumen = [
    {
      inventario_id: inventarioId,
      nombre: meta?.nombre ?? "",
      observacion: meta?.descripcion ?? "",
      "fecha de creacion": meta?.fecha_creacion ? fmtDateTime(meta.fecha_creacion) : "",
      "fecha de exportacion": fmtDateTime(Date.now()),
      "total filas": data.length,
      tipo: "cantidades",
    },
  ];
  const wsRes = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsRes, "resumen");

  const now = new Date();
  const fname =
    `inventario_${inventarioId}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `_${pad2(now.getHours())}${pad2(now.getMinutes())}.xlsx`;

  const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const fileUri = FileSystem.documentDirectory! + fname;
  await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });

  return { fileUri, rows: data.length, fileName: fname };
}

/** Exporta inventario CON VENCIMIENTO con columnas unificadas (SIN 'lote').
 * Última columna: "fecha de vencimiento".
 */
export async function exportInventoryWithExpiryToExcel(inventarioId: number) {
  const db = await getDB();

  // SIN 'lote'
  const rows = await db.getAllAsync<Row & { fecha_vto: number }>(
    `SELECT v.ean,
            a.codigo_articulo,
            a.descripcion,
            COALESCE(a.unidades_por_bulto, 1) as unidades_por_bulto,
            v.cantidad,
            v.fecha_vto,
            v.ts
     FROM inventario_vencimientos v
     JOIN articulos a ON a.ean = v.ean
     WHERE v.inventario_id = ?
     ORDER BY v.fecha_vto ASC, a.descripcion COLLATE NOCASE ASC`,
    [inventarioId]
  );

  if (!rows || rows.length === 0) {
    throw new Error("Este inventario (vencimientos) no tiene ítems para exportar.");
  }

  const data = rows.map((r) => {
    const upb = Math.max(1, Number(r.unidades_por_bulto ?? 1));
    const cantidad = Number(r.cantidad ?? 0);
    const bultos = Math.floor(cantidad / upb);
    return {
      ean: r.ean,
      "codigo articulo": r.codigo_articulo,
      descripcion: r.descripcion,
      "unidades por bulto": upb,
      bultos,
      cantidad,
      "fecha de ingreso": r.ts ? fmtDateTime(r.ts) : "",
      "fecha de vencimiento": fmtDate(r.fecha_vto), // SIEMPRE última columna
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "vencimientos");

  // Hoja Resumen
  const meta = await getInventoryMeta(inventarioId);
  const resumen = [
    {
      inventario_id: inventarioId,
      nombre: meta?.nombre ?? "",
      observacion: meta?.descripcion ?? "",
      "fecha de creacion": meta?.fecha_creacion ? fmtDateTime(meta.fecha_creacion) : "",
      "fecha de exportacion": fmtDateTime(Date.now()),
      "total filas": data.length,
      tipo: "vencimientos",
    },
  ];
  const wsRes = XLSX.utils.json_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsRes, "resumen");

  const now = new Date();
  const fname =
    `inventario_vto_${inventarioId}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `_${pad2(now.getHours())}${pad2(now.getMinutes())}.xlsx`;

  const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const fileUri = FileSystem.documentDirectory! + fname;
  await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });

  return { fileUri, rows: data.length, fileName: fname };
}

export async function shareFile(fileUri: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Compartir no está disponible en este dispositivo.");
  }
  await Sharing.shareAsync(fileUri, {
    UTI: "org.openxmlformats.spreadsheetml.sheet",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
