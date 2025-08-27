// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      {/* El Stack se autoconfigura con los archivos de app/* */}
    </Stack>
  );
}
