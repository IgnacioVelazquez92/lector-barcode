import { Link, Stack } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Inicio" }} />

      <View style={styles.brand}>
        <Text style={styles.title}>Aledo Inventarios</Text>
        <Text style={styles.subtitle}>by Ignacio Velazquez</Text>
      </View>

      <Link href="/import" asChild>
        <TouchableOpacity style={styles.btn}>
          <Text style={styles.btnText}>Importar catálogo</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/inventory/new" asChild>
        <TouchableOpacity style={styles.btn}>
          <Text style={styles.btnText}>Nuevo inventario</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/inventory/list" asChild>
        <TouchableOpacity style={styles.btn}>
          <Text style={styles.btnText}>Inventarios guardados</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 12, color: "#6b7280", marginTop: 4, letterSpacing: 0.5 },
  btn: { backgroundColor: "#0EA5E9", padding: 14, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
