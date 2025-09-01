// app/inventory/active.tsx
import { useHeaderHeight } from "@react-navigation/elements";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import PluSearchModal from "../../components/PluSearchModal";
import { exportInventoryToExcel, shareFile } from "../../features/inventory/exportInventory";
import {
  addToItemCantidad,
  findArticleByEAN,
  getInventoryById,
  getInventoryItems,
  getItem,
  removeItem,
  renameInventory,
  setItemCantidad,
  type Articulo,
} from "../../features/inventory/inventoryService";
import {
  findArticleByPLU,
  isPluPackedBarcode,
  isScaleBarcode,
  parseScaleBarcode,
  toBaseScaleEAN,
} from "../../features/inventory/scale";
import ScannerView from "../../features/inventory/scanner/ScannerView";

const normalizeEAN = (raw: string) => {
  let s = (raw ?? "").trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s;
};
const hasDecimals = (n: number) => Math.floor(n) !== n;

export default function ActiveInventory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invId = useMemo(() => Number(id), [id]);
  const headerHeight = useHeaderHeight();

  const [invName, setInvName] = useState<string>("");
  const [invDesc, setInvDesc] = useState<string>("");
  const [editVisible, setEditVisible] = useState(false);

  const [ean, setEan] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [articlePreview, setArticlePreview] = useState<Articulo | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanVisible, setScanVisible] = useState(false);

  // Modal búsqueda por código interno (PLU / código_articulo) – ahora componentizado
  const [findVisible, setFindVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const inv = await getInventoryById(invId);
      setInvName(inv?.nombre ?? `Inventario ${invId}`);
      setInvDesc(inv?.descripcion ?? "");
      await refreshItems();
      setLoading(false);
    })();
  }, [invId]);

  const refreshItems = async () => {
    const rows = await getInventoryItems(invId);
    setItems(rows);
  };

  const resolveInput = async (raw: string) => {
    const code = normalizeEAN(raw);
    let art: Articulo | null = null;
    let saveEAN = code;
    let suggestedQty: number | undefined;

    // Tickets de balanza con peso (ej: 21 + PLU + peso)
    if (isScaleBarcode(code)) {
      const parsed = parseScaleBarcode(code);
      const base = toBaseScaleEAN(code);
      if (parsed?.plu) {
        const found = await findArticleByPLU(parsed.plu);
        if (found) {
          if (base) {
            const existsBase = await findArticleByEAN(base);
            saveEAN = existsBase ? base : found.ean;
          } else {
            saveEAN = found.ean;
          }
          art = found;
          if (parsed.weightKg != null && isFinite(parsed.weightKg)) suggestedQty = parsed.weightKg;
          return { art, saveEAN, suggestedQty };
        }
      }
    }

    // Tickets “packed por unidad” (solo PLU)
    if (isPluPackedBarcode(code)) {
      const plu = String(Number(code.slice(-5)));
      const found = await findArticleByPLU(plu);
      if (found) return { art: found, saveEAN: found.ean, suggestedQty };
    }

    // EAN directo
    art = await findArticleByEAN(code);
    return { art, saveEAN: code, suggestedQty };
  };

  const previewByInput = async (value: string) => {
    const { art, saveEAN, suggestedQty } = await resolveInput(value);
    setEan(saveEAN);
    setArticlePreview(art);
    if (!art) {
      Alert.alert("Código no encontrado", "No existe en el catálogo.");
      return;
    }
    if (suggestedQty != null && isFinite(suggestedQty)) setCantidad(String(suggestedQty).replace(".", ","));
  };

  const handleBlurEAN = async () => {
    const e = normalizeEAN(ean);
    if (!e) {
      setArticlePreview(null);
      return;
    }
    await previewByInput(e);
  };

  const handleDetected = async (scanned: string) => {
    await previewByInput(scanned);
    setScanVisible(false);
  };

  const proceedAdd = async (saveEAN: string, cant: number) => {
    const existente = await getItem(invId, saveEAN);
    if (existente) {
      Alert.alert("Este código ya fue contado", "¿Querés sumar a la cantidad existente o reemplazarla?", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sumar",
          onPress: async () => {
            await addToItemCantidad(invId, saveEAN, cant);
            await refreshItems();
            setCantidad("");
            setEan("");
            setArticlePreview(null);
          },
        },
        {
          text: "Reemplazar",
          style: "destructive",
          onPress: async () => {
            await setItemCantidad(invId, saveEAN, cant);
            await refreshItems();
            setCantidad("");
            setEan("");
            setArticlePreview(null);
          },
        },
      ]);
      return;
    }
    await setItemCantidad(invId, saveEAN, cant);
    await refreshItems();
    setCantidad("");
    setEan("");
    setArticlePreview(null);
  };

  const handleAgregar = async () => {
    const saveEAN = normalizeEAN(ean);
    const cant = Number(String(cantidad).replace(",", "."));
    if (!saveEAN) {
      Alert.alert("Falta código", "Ingresá o escaneá un código.");
      return;
    }
    if (!isFinite(cant) || cant <= 0) {
      Alert.alert("Cantidad inválida", "Ingresá una cantidad mayor a 0.");
      return;
    }
    const { art } = await resolveInput(saveEAN);
    if (!art) {
      Alert.alert("Código no encontrado", "No existe en catálogo.");
      return;
    }
    if ((art.pesable ?? 0) === 0 && hasDecimals(cant)) {
      Alert.alert("Decimal en artículo NO pesable", "Este artículo no es pesable. ¿Registrar cantidad decimal?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Continuar", style: "destructive", onPress: () => proceedAdd(saveEAN, cant) },
      ]);
      return;
    }
    await proceedAdd(saveEAN, cant);
  };

  const handleRemove = async (row: any) => {
    Alert.alert("Eliminar ítem", `¿Eliminar ${row.descripcion ?? row.ean}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await removeItem(invId, row.ean);
          await refreshItems();
        },
      },
    ]);
  };

  const handleExport = async () => {
    try {
      const { fileUri, rows, fileName } = await exportInventoryToExcel(invId);
      Alert.alert("Exportación exitosa", `Archivo: ${fileName}\nFilas: ${rows}`);
      await shareFile(fileUri);
    } catch (e: any) {
      Alert.alert("No se pudo exportar", e?.message ?? "Error desconocido");
    }
  };

  const saveMeta = async () => {
    try {
      await renameInventory(invId, invName, invDesc);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo guardar.");
    } finally {
      setEditVisible(false);
    }
  };

  // Handler cuando elegís un EAN desde el modal PLU
  const pickFoundEAN = async (a: Articulo) => {
    setFindVisible(false);
    await previewByInput(a.ean);
  };

  const HeaderUI = (
    <View style={styles.headerWrap}>
      <Stack.Screen
        options={{
          title: `Inventario: ${invName}`,
          headerRight: () => (
            <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>✏️</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <Text style={styles.label}>EAN / PLU / Ticket balanza</Text>
      <TextInput
        value={ean}
        onChangeText={setEan}
        onBlur={handleBlurEAN}
        placeholder="Escaneá o ingresá el código"
        style={styles.input}
        autoCapitalize="none"
        keyboardType="numeric"
      />

      {/* FILA: Escanear / Buscar por PLU */}

      <View style={styles.inlineBtns}>
        <TouchableOpacity onPress={() => setScanVisible(true)} style={[styles.btnScan, styles.btnInline]}>
          <Text style={styles.btnText} numberOfLines={1}>📷 Escanear</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFindVisible(true)} style={[styles.btnPlu, styles.btnInline]}>
          <Text style={styles.btnText} numberOfLines={1}>🔢 PLU</Text>
        </TouchableOpacity>
      </View>

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
        <Text style={styles.btnText}>Agregar</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleExport} style={[styles.btnPrimary, { backgroundColor: "#0EA5E9" }]}>
        <Text style={styles.btnText}>Exportar Excel</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Cargados</Text>
    </View>
  );

  const renderRow = ({ item }: { item: any }) => (
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderRow}
        ListHeaderComponent={HeaderUI}
        ListEmptyComponent={<Text style={{ color: "#666", paddingHorizontal: 16 }}>Aún no hay ítems.</Text>}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        refreshing={loading}
        onRefresh={refreshItems}
      />

      <ScannerView visible={scanVisible} onClose={() => setScanVisible(false)} onDetected={handleDetected} />

      {/* Modal editar nombre/observación */}
      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalCard}
          >
            <Text style={styles.modalTitle}>Editar inventario</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput value={invName} onChangeText={setInvName} style={styles.input} />
            <Text style={styles.label}>Observación</Text>
            <TextInput value={invDesc} onChangeText={setInvDesc} style={[styles.input, { height: 90 }]} multiline />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setEditVisible(false)}
                style={[styles.btnPrimary, { backgroundColor: "#6b7280", flex: 1 }]}
              >
                <Text style={styles.btnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveMeta}
                style={[styles.btnPrimary, { backgroundColor: "#16A34A", flex: 1 }]}
              >
                <Text style={styles.btnText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal buscar por código interno – componentizado */}
      <PluSearchModal visible={findVisible} onClose={() => setFindVisible(false)} onPick={pickFoundEAN} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerWrap: { padding: 16, gap: 10 },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: { fontSize: 18 },

  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },

  // Botones en línea
  inlineBtns: { flexDirection: "row", gap: 8 },
  btnInline: { flex: 1 },

  // Botón principal (Agregar / Exportar con override de color)
  btnPrimary: {
    backgroundColor: "#16A34A",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },

  // (se puede seguir usando en otros lugares si lo necesitás)
  btnAlt: {
    backgroundColor: "#0F766E",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },

  // NUEVOS: botones cortos con emoji
  btnScan: {
    backgroundColor: "#111827", // negro
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  btnPlu: {
    backgroundColor: "#0F766E", // verde azulado
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },

  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  preview: { backgroundColor: "#F1F5F9", padding: 10, borderRadius: 10 },
  previewTitle: { fontSize: 16, fontWeight: "700" },
  previewSub: { fontSize: 13, color: "#555" },

  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 10 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, color: "#666" },

  qtyBox: {
    minWidth: 56,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  qty: { fontSize: 16, fontWeight: "800" },
  deleteBtn: { backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },

  // Modal de edición (nombre / observación)
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
});
