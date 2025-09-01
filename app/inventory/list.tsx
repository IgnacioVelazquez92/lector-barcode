import { useFocusEffect } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { exportInventoryToExcel, exportInventoryWithExpiryToExcel, shareFile } from "../../features/inventory/exportInventory";
import {
  deleteInventory,
  getInventoriesWithStats,
  type InventarioStats,
} from "../../features/inventory/inventoryService";

const fmtDate = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function InventoryList() {
  const [data, setData] = useState<InventarioStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getInventoriesWithStats();
      setData(rows);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleOpen = (id: number, item: InventarioStats) => {
    if (item.items_vto > 0 && item.items_cant === 0) {
      router.push({ pathname: "/inventory/expiry", params: { id: String(id) } });
    } else {
      router.push({ pathname: "/inventory/active", params: { id: String(id) } });
    }
  };

  const doExport = async (item: InventarioStats) => {
    if (item.items_vto > 0 && item.items_cant === 0) {
      const { fileUri, rows, fileName } = await exportInventoryWithExpiryToExcel(item.id);
      Alert.alert("Exportación lista", `Archivo: ${fileName}\nFilas: ${rows}`);
      await shareFile(fileUri);
      return;
    }
    if (item.items_cant > 0 && item.items_vto === 0) {
      const { fileUri, rows, fileName } = await exportInventoryToExcel(item.id);
      Alert.alert("Exportación lista", `Archivo: ${fileName}\nFilas: ${rows}`);
      await shareFile(fileUri);
      return;
    }
    Alert.alert(
      "Elegí qué exportar",
      "Este inventario tiene cantidades y vencimientos.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cantidades",
          onPress: async () => {
            const { fileUri, rows, fileName } = await exportInventoryToExcel(item.id);
            Alert.alert("Exportación lista", `Archivo: ${fileName}\nFilas: ${rows}`);
            await shareFile(fileUri);
          },
        },
        {
          text: "Vencimientos",
          onPress: async () => {
            const { fileUri, rows, fileName } = await exportInventoryWithExpiryToExcel(item.id);
            Alert.alert("Exportación lista", `Archivo: ${fileName}\nFilas: ${rows}`);
            await shareFile(fileUri);
          },
        },
      ]
    );
  };

  const handleExport = async (id: number) => {
    const item = data.find((x) => x.id === id);
    if (!item) return;
    try {
      await doExport(item);
    } catch (e: any) {
      Alert.alert("No se pudo exportar", e?.message ?? "Error desconocido");
    }
  };

  const renderItem = ({ item }: { item: InventarioStats }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.nombre}</Text>
        {!!item.descripcion && <Text style={styles.desc}>{item.descripcion}</Text>}
        <Text style={styles.meta}>
          <Text style={{ fontWeight: "700" }}>Productos</Text>: {item.items} (cant: {item.items_cant}, vto: {item.items_vto}) · Creado: {fmtDate(item.fecha_creacion)} · Últ. mod: {fmtDate(item.ultima_modificacion)}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => handleOpen(item.id, item)} style={[styles.btn, styles.btnGreen]}>
          <Text style={styles.btnText}>Continuar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleExport(item.id)} style={[styles.btn, styles.btnBlue]}>
          <Text style={styles.btnText}>Exportar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id, item.nombre)} style={[styles.btn, styles.btnRed]}>
          <Text style={styles.btnText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleDelete = (id: number, nombre: string) => {
    Alert.alert(
      "Eliminar inventario",
      `¿Seguro que querés eliminar "${nombre}"? Se borrarán también sus ítems.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar", style: "destructive",
          onPress: async () => {
            try {
              await deleteInventory(id);
              await load();
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "No se pudo eliminar");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Inventarios guardados" }} />
      <FlatList
        data={data}
        refreshing={loading}
        onRefresh={load}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={!loading ? <Text style={{ color: "#666" }}>No hay inventarios aún.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    borderWidth: 1, borderColor: "#eee", backgroundColor: "#fff",
    borderRadius: 12, padding: 12, flexDirection: "row", gap: 12, alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: "800" },
  desc: { fontSize: 13, color: "#444", marginTop: 2 },
  meta: { fontSize: 12, color: "#666", marginTop: 4 },
  actions: { gap: 6, alignItems: "flex-end" },
  btn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  btnGreen: { backgroundColor: "#16A34A" },
  btnBlue: { backgroundColor: "#0EA5E9" },
  btnRed: { backgroundColor: "#EF4444" },
});
