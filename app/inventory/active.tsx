// app/inventory/active.tsx
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  addToItemCantidad,
  findArticleByEAN,
  getInventoryById,
  getInventoryItems,
  getItem,
  removeItem,
  setItemCantidad,
} from "../../features/inventory/inventoryService";
import ScannerView from "../../features/inventory/scanner/ScannerView";

import { exportInventoryToExcel, shareFile } from "../../features/inventory/exportInventory";


const normalizeEAN = (raw: string) => {
  let s = (raw ?? "").trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s;
};

export default function ActiveInventory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invId = useMemo(() => Number(id), [id]);

  const [invName, setInvName] = useState<string>("");
  const [ean, setEan] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [articlePreview, setArticlePreview] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanVisible, setScanVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const inv = await getInventoryById(invId);
      if (mounted) setInvName(inv?.nombre ?? `Inventario ${invId}`);
      await refreshItems();
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [invId]);

  const refreshItems = async () => {
    const rows = await getInventoryItems(invId);
    setItems(rows);
  };

  const previewByEAN = async (eanValue: string) => {
    const art = await findArticleByEAN(eanValue);
    setArticlePreview(art);
    if (!art) {
      Alert.alert("EAN no encontrado", "No existe en el catálogo. Reintentá o corregí manualmente.");
    }
  };

  const handleBlurEAN = async () => {
    const e = normalizeEAN(ean);
    if (!e) { setArticlePreview(null); return; }
    await previewByEAN(e);
  };

  const handleDetected = async (scanned: string) => {
    const e = normalizeEAN(scanned);
    setEan(e);
    await previewByEAN(e);
  };

  const handleAgregar = async () => {
    const e = normalizeEAN(ean);
    const cant = Number(String(cantidad).replace(",", "."));
    if (!e) {
      Alert.alert("Falta EAN", "Ingresá o escaneá un código de barras.");
      return;
    }
    if (!isFinite(cant) || cant <= 0) {
      Alert.alert("Cantidad inválida", "Ingresá una cantidad numérica mayor a 0.");
      return;
    }

    const art = await findArticleByEAN(e);
    if (!art) {
      Alert.alert("EAN no encontrado", "No existe en catálogo, no se puede agregar.");
      return;
    }

    const existente = await getItem(invId, e);
    if (existente) {
      Alert.alert(
        "Este EAN ya fue contado",
        "¿Querés sumar a la cantidad existente o reemplazarla?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Sumar",
            onPress: async () => {
              await addToItemCantidad(invId, e, cant);
              await refreshItems();
              setCantidad(""); setEan(""); setArticlePreview(null);
            },
          },
          {
            text: "Reemplazar",
            style: "destructive",
            onPress: async () => {
              await setItemCantidad(invId, e, cant);
              await refreshItems();
              setCantidad(""); setEan(""); setArticlePreview(null);
            },
          },
        ]
      );
      return;
    }

    await setItemCantidad(invId, e, cant);
    await refreshItems();
    setCantidad(""); setEan(""); setArticlePreview(null);
  };

  const handleRemove = async (row: any) => {
    Alert.alert(
      "Eliminar ítem",
      `¿Eliminar ${row.descripcion ?? row.ean} del inventario?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await removeItem(invId, row.ean);
            await refreshItems();
          },
        },
      ]
    );
  };

    const handleExport = async () => {
      try {
        const { fileUri, rows, fileName } = await exportInventoryToExcel(invId);
        Alert.alert("Exportación exitosa", `Archivo: ${fileName}\nFilas: ${rows}`);
        await shareFile(fileUri); // abre el diálogo para WhatsApp/Drive/Email, etc.
      } catch (e: any) {
        Alert.alert("No se pudo exportar", e?.message ?? "Error desconocido");
      }
    };
  

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.descripcion ?? item.ean}</Text>
        <Text style={styles.rowSub}>
          EAN: {item.ean} · Código: {item.codigo_articulo} · UxB: {item.unidades_por_bulto ?? 1}
        </Text>
      </View>
      <View style={styles.qtyBox}>
        <Text style={styles.qty}>{item.cantidad}</Text>
      </View>
      <TouchableOpacity onPress={() => handleRemove(item)} style={styles.deleteBtn}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Inventario: ${invName}` }} />

      <Text style={styles.label}>EAN</Text>
      <TextInput
        value={ean}
        onChangeText={setEan}
        onBlur={handleBlurEAN}
        placeholder="Escaneá o ingresá el EAN"
        style={styles.input}
        autoCapitalize="none"
        keyboardType="numeric"
      />

      {/* Botón grande para abrir el escáner */}
      <TouchableOpacity onPress={() => setScanVisible(true)} style={styles.scanFullBtn}>
        <Text style={styles.btnText}>Escanear código con cámara</Text>
      </TouchableOpacity>

      {articlePreview && (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>{articlePreview.descripcion}</Text>
          <Text style={styles.previewSub}>
            Código: {articlePreview.codigo_articulo} · UxB: {articlePreview.unidades_por_bulto ?? 1}
          </Text>
        </View>
      )}

      <Text style={styles.label}>Cantidad</Text>
      <TextInput
        value={cantidad}
        onChangeText={setCantidad}
        placeholder="Ej: 10"
        style={styles.input}
        keyboardType="numeric"
      />

      <TouchableOpacity onPress={handleAgregar} style={styles.btnPrimary}>
        <Text style={styles.btnText}>Agregar al inventario</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleExport} style={[styles.btnPrimary, { backgroundColor: "#0EA5E9" }]}>
        <Text style={styles.btnText}>Exportar a Excel y compartir</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Cargados</Text>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={{ color: "#666" }}>Aún no hay ítems.</Text>}
        contentContainerStyle={{ gap: 8 }}
      />

      {/* Scanner modal */}
      <ScannerView
        visible={scanVisible}
        onClose={() => setScanVisible(false)}
        onDetected={handleDetected}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, backgroundColor: "#fff",
  },
  scanFullBtn: {
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  btnPrimary: { backgroundColor: "#16A34A", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  preview: { backgroundColor: "#F1F5F9", padding: 10, borderRadius: 10 },
  previewTitle: { fontSize: 16, fontWeight: "700" },
  previewSub: { fontSize: 13, color: "#555" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#eee", padding: 10
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, color: "#666" },
  qtyBox: { minWidth: 56, height: 36, borderRadius: 8, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  qty: { fontSize: 16, fontWeight: "800" },
  deleteBtn: { backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
});
