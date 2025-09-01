import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createInventory } from "../../features/inventory/inventoryService";

export default function NewInventory() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isVto = useMemo(() => mode === "vto", [mode]);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const handleCreate = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta nombre", "Ingresá un nombre para el inventario.");
      return;
    }
    try {
      const id = await createInventory(nombre, descripcion);
      router.replace({
        pathname: isVto ? "/inventory/expiry" : "/inventory/active",
        params: { id: String(id) },
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo crear el inventario.");
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isVto ? "Nuevo inventario (vencimientos)" : "Nuevo inventario" }} />
      <Text style={styles.label}>Nombre *</Text>
      <TextInput
        value={nombre}
        onChangeText={setNombre}
        placeholder={isVto ? "Ej: Recepción lácteos - vtos" : "Ej: Pre-inventario Góndola A"}
        style={styles.input}
      />

      <Text style={styles.label}>Descripción (opcional)</Text>
      <TextInput
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Notas breves..."
        style={[styles.input, { height: 80 }]}
        multiline
      />

      <TouchableOpacity onPress={handleCreate} style={styles.btn}>
        <Text style={styles.btnText}>Crear y continuar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, backgroundColor: "#fff",
  },
  btn: { backgroundColor: "#0EA5E9", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
