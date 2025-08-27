// app/import/index.tsx
import { Stack } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import { pickAndImportCatalog } from "../../features/catalog/catalogService";

export default function ImportScreen() {
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState<string>("");

  const handleImport = async () => {
    setResultText("");
    setLoading(true);
    try {
      const { total } = await pickAndImportCatalog();
      setResultText(`Catálogo actualizado correctamente. Filas importadas: ${total}.`);
    } catch (e: any) {
      setResultText(`Error: ${e?.message ?? "No se pudo importar el catálogo"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Importar catálogo" }} />
      <Text style={styles.title}>Importar Excel de artículos</Text>

      <TouchableOpacity onPress={handleImport} style={styles.button} disabled={loading}>
        {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Seleccionar archivo y reemplazar</Text>}
      </TouchableOpacity>

      {!!resultText && <Text style={styles.result}>{resultText}</Text>}

      <Text style={styles.hint}>
        Formato esperado de columnas:{"\n"}
        EAN, codigo_articulo, descripcion, unidades_por_bulto
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, justifyContent: "flex-start" },
  title: { fontSize: 20, fontWeight: "600" },
  button: {
    backgroundColor: "#0EA5E9",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  result: { marginTop: 8, fontSize: 14 },
  hint: { marginTop: 16, fontSize: 12, color: "#666" },
});
