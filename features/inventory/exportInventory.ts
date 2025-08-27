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
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export async function exportInventoryToExcel(inventarioId: number) {
  const db = await getDB();

  const rows = await db.getAllAsync<Row>(
    `SELECT i.ean,
            a.codigo_articulo,
            a.descripcion,
            COALESCE(a.unidades_por_bulto, 1) as unidades_por_bulto,
            i.cantidad
     FROM inventario_items i
     JOIN articulos a ON a.ean = i.ean
     WHERE i.inventario_id = ?
     ORDER BY a.descripcion COLLATE NOCASE ASC`,
    [inventarioId]
  );

  if (!rows || rows.length === 0) {
    throw new Error("Este inventario no tiene ítems para exportar.");
  }

  // Mapeo a formato solicitado + cálculo de bultos
  const data = rows.map(r => {
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
    };
  });

  // Crear workbook
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "inventario");

  // Serializar a base64 y guardar
  const now = new Date();
  const fname =
    `inventario_${inventarioId}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
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
