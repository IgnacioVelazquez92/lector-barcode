import React, { useEffect, useRef, useState } from "react";
import {
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
import { findArticlesByCodigo, type Articulo } from "../features/inventory/inventoryService";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (a: Articulo) => void;
};

export default function PluSearchModal({ visible, onClose, onPick }: Props) {
  const [code, setCode] = useState("");
  const [results, setResults] = useState<Articulo[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setResults([]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setCode("");
      setResults([]);
      setLoading(false);
    }
  }, [visible]);

  const doSearch = async () => {
    const c = String(code ?? "").trim();
    if (!c) return;
    setLoading(true);
    try {
      const r = await findArticlesByCodigo(c);
      setResults(r);
    } finally {
      setLoading(false);
    }
  };

  const handlePick = (a: Articulo) => onPick(a);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      transparent={false}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header simple */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Buscar por código interno</Text>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cerrar</Text>
          </TouchableOpacity>
        </View>

        {/* Cuerpo */}
        <View style={styles.body}>
          {/* Fila: Input + Limpiar + Buscar */}
          <View style={styles.formRow}>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={setCode}
              placeholder="PLU / código interno (p. ej. 510)"
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              returnKeyType="search"
              onSubmitEditing={doSearch}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={() => {
                setCode("");
                setResults([]);
                setTimeout(() => inputRef.current?.focus(), 60);
              }}
              style={[styles.btn, styles.btnGray]}
            >
              <Text style={styles.btnText}>Limpiar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doSearch} style={[styles.btn, styles.btnBlue]}>
              <Text style={styles.btnText}>{loading ? "…" : "Buscar"}</Text>
            </TouchableOpacity>
          </View>

          {/* Resultados – ocupa todo el espacio restante, siempre scrolleable */}
          <FlatList
            data={results}
            keyExtractor={(a) => a.ean}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handlePick(item)} style={styles.resultItem}>
                <Text style={{ fontWeight: "700" }}>{item.descripcion}</Text>
                <Text style={{ color: "#555", marginTop: 2 }}>
                  EAN: {item.ean} · Código: {item.codigo_articulo} · UxB: {item.unidades_por_bulto ?? 1}
                </Text>
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={() =>
              !loading ? (
                <Text style={{ color: "#6b7280", paddingVertical: 12 }}>
                  Ingresá un PLU y presioná Buscar.
                </Text>
              ) : null
            }
            contentContainerStyle={results.length ? undefined : { paddingTop: 8 }}
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingTop: Platform.select({ android: 16, ios: 48 }),
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#e5e7eb", borderRadius: 8 },
  headerBtnText: { fontWeight: "700", color: "#111827" },
  body: { flex: 1, padding: 16, gap: 12 },
  formRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  btn: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  btnBlue: { backgroundColor: "#0EA5E9" },
  btnGray: { backgroundColor: "#6b7280" },
  btnText: { color: "#fff", fontWeight: "700" },
  resultItem: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
});
