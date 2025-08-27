// features/inventory/scanner/ScannerView.tsx
import { CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useScanner } from "./useScanner";

type Props = {
  visible: boolean;
  onClose: () => void;
  onDetected: (ean: string) => void;
};

const normalizeEAN = (raw: string) => {
  let s = (raw ?? "").trim();
  if (s.startsWith("'")) s = s.slice(1);
  return s;
};

export default function ScannerView({ visible, onClose, onDetected }: Props) {
  const { hasPermission, ensurePermission, canHandle } = useScanner(800);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (visible) ensurePermission();
  }, [visible, ensurePermission]);

  // Cerrar apaga la linterna por seguridad
  const handleClose = () => {
    setTorch(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Escanear código de barras</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setTorch((t) => !t)} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>{torch ? "Apagar luz" : "Encender luz"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!hasPermission ? (
          <View style={styles.center}>
            <Text style={{ textAlign: "center", color: "#fff" }}>
              Necesitamos permiso de cámara. Volvé a abrir esta pantalla y aceptá el permiso.
            </Text>
          </View>
        ) : (
          <View style={styles.scannerBox}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13", "ean8", "upc_a", "upc_e",
                  "code128", "code39", "codabar", "itf14",
                  // opcionales: "qr", "pdf417", "datamatrix", "code93"
                ],
              }}
              onBarcodeScanned={({ data }) => {
                if (!canHandle()) return;
                const e = normalizeEAN(String(data));
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onDetected(e);
                handleClose();
              }}
            />

            {/* Overlay guía */}
            <View style={styles.overlay}>
              {/* Máscara oscura con recorte */}
              <View style={styles.cutout} />

              {/* Texto de ayuda arriba del recorte */}
              <View style={styles.guideTop}>
                <Text style={styles.guideText}>
                  Alineá el código dentro del recuadro
                </Text>
                <Text style={styles.guideSub}>
                  Mantené el teléfono firme; usá la luz si es necesario
                </Text>
              </View>

              {/* Esquinas marcadas para apuntar mejor */}
              <View pointerEvents="none" style={[styles.corner, styles.cornerTL]} />
              <View pointerEvents="none" style={[styles.corner, styles.cornerTR]} />
              <View pointerEvents="none" style={[styles.corner, styles.cornerBL]} />
              <View pointerEvents="none" style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
        )}

        <View style={styles.hintBox}>
          <Text style={styles.hint}>
            Tip: si el código es chico, acercate lentamente hasta que enfoque.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const BOX_MARGIN_H = 40;
const BOX_MARGIN_V = 100;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    paddingTop: Platform.select({ android: 20, ios: 50 }),
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#111",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#333", borderRadius: 8 },
  headerBtnText: { color: "#fff", fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000", paddingHorizontal: 20 },
  scannerBox: { flex: 1, position: "relative" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },

  // Recorte guía (solo borde visible; el resto se ve oscuro detrás)
  cutout: {
    position: "absolute",
    left: BOX_MARGIN_H, right: BOX_MARGIN_H, top: BOX_MARGIN_V, bottom: BOX_MARGIN_V,
    borderWidth: 2, borderColor: "#20c997", borderStyle: "dashed", borderRadius: 10,
  },

  guideTop: {
    position: "absolute",
    left: BOX_MARGIN_H,
    right: BOX_MARGIN_H,
    top: BOX_MARGIN_V - 56,
    alignItems: "center",
  },
  guideText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  guideSub: { color: "#ddd", fontSize: 12, marginTop: 4 },

  // Esquinas (marcadores) para orientar la posición del código
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#20c997",
  },
  cornerTL: {
    left: BOX_MARGIN_H - 2,
    top: BOX_MARGIN_V - 2,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    right: BOX_MARGIN_H - 2,
    top: BOX_MARGIN_V - 2,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    left: BOX_MARGIN_H - 2,
    bottom: BOX_MARGIN_V - 2,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    right: BOX_MARGIN_H - 2,
    bottom: BOX_MARGIN_V - 2,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 8,
  },

  hintBox: { padding: 12, backgroundColor: "#111" },
  hint: { color: "#bbb", fontSize: 12, textAlign: "center" },
});
