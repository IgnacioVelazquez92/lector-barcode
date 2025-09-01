import DateTimePicker from "@react-native-community/datetimepicker";
import { useHeaderHeight } from "@react-navigation/elements";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from "react-native";
import PluSearchModal from "../../components/PluSearchModal";
import { exportInventoryWithExpiryToExcel, shareFile } from "../../features/inventory/exportInventory";
import {
  addToVtoItemCantidad,
  consolidateVtoByEAN,
  findArticleByEAN,
  getInventoryById,
  // --- duplicados / consolidación ---
  getVtoItem,
  getVtoItems,
  getVtoItemsByEAN,
  removeVtoItem,
  renameInventory,
  setVtoItem,
  setVtoItemCantidad,
  type Articulo
} from "../../features/inventory/inventoryService";
import {
  findArticleByPLU,
  isPluPackedBarcode,
  isScaleBarcode,
  parseScaleBarcode,
  toBaseScaleEAN
} from "../../features/inventory/scale";
import ScannerView from "../../features/inventory/scanner/ScannerView";

const normalizeCode = (raw: string) => { let s = (raw ?? "").trim(); if (s.startsWith("'")) s = s.slice(1); return s; };
const pad2 = (n: number) => String(n).padStart(2, "0");
const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const startOfTomorrowDate = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+1); return d; };
const fmtDate = (ts: number) => { const d = new Date(ts); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; };
const hasDecimals = (n: number) => Math.floor(n) !== n;

export default function ExpiryInventory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invId = useMemo(() => Number(id), [id]);
  const headerHeight = useHeaderHeight();

  const [invName, setInvName] = useState<string>("");
  const [invDesc, setInvDesc] = useState<string>("");
  const [editVisible, setEditVisible] = useState(false);

  const [code, setCode] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [fechaTs, setFechaTs] = useState<number | null>(null);
  const [articlePreview, setArticlePreview] = useState<Articulo | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [scanVisible, setScanVisible] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Modal PLU
  const [findVisible, setFindVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const inv = await getInventoryById(invId);
      setInvName(inv?.nombre ?? `Inventario ${invId}`);
      setInvDesc(inv?.descripcion ?? "");
      await refresh();
    })();
  }, [invId]);

  const refresh = async () => {
    const r = await getVtoItems(invId);
    setRows(r);
  };

  const resolveInput = async (raw: string) => {
    const code = normalizeCode(raw);
    let art: Articulo | null = null;
    let saveEAN = code;
    let suggestedQty: number | undefined;

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

    if (isPluPackedBarcode(code)) {
      const plu = String(Number(code.slice(-5)));
      const found = await findArticleByPLU(plu);
      if (found) return { art: found, saveEAN: found.ean, suggestedQty };
    }

    art = await findArticleByEAN(code);
    return { art, saveEAN: code, suggestedQty };
  };

  const previewByInput = async (value: string) => {
    const { art, saveEAN, suggestedQty } = await resolveInput(value);
    setCode(saveEAN);
    setArticlePreview(art);
    if (!art) { Alert.alert("Código no encontrado", "No existe en el catálogo."); return; }
    if (suggestedQty != null && isFinite(suggestedQty)) setCantidad(String(suggestedQty).replace(".", ","));
  };

  const handleDetected = async (scanned: string) => { await previewByInput(scanned); setScanVisible(false); };
  const handleBlurCode = async () => { const c = normalizeCode(code); if (!c) { setArticlePreview(null); return; } await previewByInput(c); };

  // --- flujo si existe EAN + MISMA fecha ---
  const proceedAddSameDate = async (ean: string, fecha: number, cant: number) => {
    const existente = await getVtoItem(invId, ean, fecha);
    if (existente) {
      Alert.alert("Este código ya fue contado para esa fecha", "¿Querés sumar a la cantidad existente o reemplazarla?", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sumar",
          onPress: async () => {
            await addToVtoItemCantidad(invId, ean, fecha, cant);
            await refresh();
            resetFields();
          }
        },
        {
          text: "Reemplazar",
          style: "destructive",
          onPress: async () => {
            await setVtoItemCantidad(invId, ean, fecha, cant);
            await refresh();
            resetFields();
          }
        },
      ]);
      return true; // se manejó con alerta
    }
    return false; // no había misma fecha
  };

  const resetFields = () => {
    setCantidad("");
    setCode("");
    setArticlePreview(null);
    setFechaTs(null);
  };

  // --- flujo si existe EAN con OTRA fecha (consolidación) ---
  const handleOtherDates = async (ean: string, nuevaFecha: number, nuevaCant: number) => {
    const rowsSameEAN = await getVtoItemsByEAN(invId, ean);
    if (!rowsSameEAN.length) return false;

    const fechas = rowsSameEAN.map(r => r.fecha_vto);
    const sumaExistente = rowsSameEAN.reduce((acc, r) => acc + Number(r.cantidad ?? 0), 0);
    const fechaMin = Math.min(...fechas);
    const fechasLegibles = [...new Set(fechas)].map(fmtDate).join(", ");

    Alert.alert(
      "Este EAN ya tiene otras fechas",
      `Fechas existentes: ${fechasLegibles}\n¿Cómo querés proceder?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sumar y mantener fecha más baja",
          onPress: async () => {
            const total = sumaExistente + nuevaCant;
            const keep = Math.min(fechaMin, nuevaFecha);
            await consolidateVtoByEAN(invId, ean, keep, total);
            await refresh();
            resetFields();
          }
        },
        {
          text: "Reemplazar por nueva fecha",
          style: "destructive",
          onPress: async () => {
            // Reemplaza TODO por la nueva fecha y SOLO la nueva cantidad
            await consolidateVtoByEAN(invId, ean, nuevaFecha, nuevaCant);
            await refresh();
            resetFields();
          }
        },
      ]
    );
    return true;
  };

  const handleAdd = async () => {
    const c = normalizeCode(code);
    const cant = Number(String(cantidad).replace(",", "."));
    if (!c) { Alert.alert("Falta código", "Escaneá o ingresá el código."); return; }
    if (!isFinite(cant) || cant <= 0) { Alert.alert("Cantidad inválida", "Ingresá una cantidad mayor a 0."); return; }
    if (fechaTs == null) { Alert.alert("Fecha requerida", "Elegí la fecha de vencimiento."); return; }
    if (fechaTs <= startOfToday()) { Alert.alert("Fecha inválida", "La fecha de vencimiento debe ser mayor a la fecha actual."); return; }

    const art = await findArticleByEAN(c);
    if (!art) { Alert.alert("Código no encontrado", "No existe en el catálogo."); return; }

    // Restricción decimales para NO pesables (con confirmación)
    if ((art.pesable ?? 0) === 0 && hasDecimals(cant)) {
      Alert.alert("Decimal en artículo NO pesable", "Este artículo no es pesable. ¿Registrar cantidad decimal?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Continuar", style: "destructive", onPress: async () => { await addOrConsolidate(c, fechaTs, cant); } },
      ]);
      return;
    }

    await addOrConsolidate(c, fechaTs, cant);
  };

  const addOrConsolidate = async (ean: string, fecha: number, cant: number) => {
    // 1) ¿Existe misma fecha? -> sumar/reemplazar
    const handledSameDate = await proceedAddSameDate(ean, fecha, cant);
    if (handledSameDate) return;

    // 2) ¿Existen otras fechas para mismo EAN? -> consolidar (sumar+fecha baja o reemplazar por nueva)
    const handledOtherDates = await handleOtherDates(ean, fecha, cant);
    if (handledOtherDates) return;

    // 3) No existe nada aún -> inserta normal
    await setVtoItem(invId, ean, cant, fecha, "");
    await refresh();
    resetFields();
  };

  const handleExport = async () => {
    try {
      const { fileUri, rows, fileName } = await exportInventoryWithExpiryToExcel(invId);
      Alert.alert("Exportación lista", `Archivo: ${fileName}\nFilas: ${rows}`);
      await shareFile(fileUri);
    } catch (e: any) {
      Alert.alert("No se pudo exportar", e?.message ?? "Error desconocido");
    }
  };

  const saveMeta = async () => {
    try {
      await renameInventory(invId, invName, invDesc);
      setEditVisible(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo guardar.");
    }
  };

  const pickFoundEAN = async (a: Articulo) => {
    setFindVisible(false);
    await previewByInput(a.ean);
  };

  const DatePicker = (
    <>
      <Text style={styles.label}>Fecha de vencimiento</Text>
      <TouchableOpacity onPress={() => setShowPicker(true)} style={[styles.input, styles.dateBtn]} activeOpacity={0.7}>
        <Text style={styles.dateBtnText}>{fechaTs ? fmtDate(fechaTs) : "Elegir fecha"}</Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={fechaTs ? new Date(fechaTs) : startOfTomorrowDate()}
          mode="date"
          display={Platform.select({ ios: "spinner", android: "default" })}
          minimumDate={startOfTomorrowDate()}
          onChange={(event, selectedDate) => {
            if (Platform.OS === "android" && (event as any).type === "dismissed") { setShowPicker(false); return; }
            const d = selectedDate ?? startOfTomorrowDate();
            d.setHours(0, 0, 0, 0);
            setFechaTs(d.getTime());
            setShowPicker(false);
          }}
        />
      )}
    </>
  );

  const HeaderUI = (
    <View style={styles.headerWrap}>
      <Stack.Screen
        options={{
          title: `Inventario (Vencimientos): ${invName}`,
          headerRight: () => (
            <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>✏️</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <Text style={styles.label}>Código (EAN / PLU / Ticket balanza)</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        onBlur={handleBlurCode}
        placeholder="Escaneá o ingresá"
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
        placeholder="Ej: 6"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      {DatePicker}

      <TouchableOpacity onPress={handleAdd} style={styles.btnPrimary}>
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
          EAN: {item.ean} · Código: {item.codigo_articulo} · Vence: {fmtDate(item.fecha_vto)}
        </Text>
      </View>
      <View style={styles.qtyBox}><Text style={styles.qty}>{item.cantidad}</Text></View>
      <TouchableOpacity onPress={() => removeVtoItem(item.id).then(refresh)} style={styles.deleteBtn}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
      <FlatList
        data={rows}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderRow}
        ListHeaderComponent={HeaderUI}
        ListEmptyComponent={<Text style={{ color: "#666", paddingHorizontal: 16 }}>Aún no hay ítems.</Text>}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      />

      <ScannerView visible={scanVisible} onClose={() => setScanVisible(false)} onDetected={handleDetected} />

      {/* Modal editar nombre/observación */}
      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar inventario</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput value={invName} onChangeText={setInvName} style={styles.input} />
            <Text style={styles.label}>Observación</Text>
            <TextInput value={invDesc} onChangeText={setInvDesc} style={[styles.input, { height: 90 }]} multiline />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity onPress={() => setEditVisible(false)} style={[styles.btnPrimary, { backgroundColor: "#6b7280", flex: 1 }]}><Text style={styles.btnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveMeta} style={[styles.btnPrimary, { backgroundColor: "#16A34A", flex: 1 }]}><Text style={styles.btnText}>Guardar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal PLU */}
      <PluSearchModal
        visible={findVisible}
        onClose={() => setFindVisible(false)}
        onPick={pickFoundEAN}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerWrap: { padding: 16, gap: 10 },
  headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: { fontSize: 18 },

  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: "#fff"
  },

  dateBtn: { justifyContent: "center" },
  dateBtnText: { fontSize: 16, color: "#111" },

  inlineBtns: { flexDirection: "row", gap: 8 },
  btnInline: { flex: 1 },

  btnScan: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  btnPlu: {
    backgroundColor: "#0F766E",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },

  btnPrimary: {
    backgroundColor: "#16A34A",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  preview: { backgroundColor: "#F1F5F9", padding: 10, borderRadius: 10 },
  previewTitle: { fontSize: 16, fontWeight: "700" },
  previewSub: { fontSize: 13, color: "#555" },

  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 10 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#eee",
    padding: 10, marginHorizontal: 16, marginBottom: 8
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, color: "#666" },

  qtyBox: {
    minWidth: 56, height: 36, borderRadius: 8, backgroundColor: "#F3F4F6",
    justifyContent: "center", alignItems: "center"
  },
  qty: { fontSize: 16, fontWeight: "800" },
  deleteBtn: { backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
});
