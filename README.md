# Aledo Inventarios (inventario-rn)

Aplicación móvil (Expo/React Native) para **inventarios** de góndola/almacén, **pesables** (balanza/PLU) y **recepciones con fecha de vencimiento**, con base local **SQLite** y exportación a **Excel**.

## ✨ Funcionalidades

- **Catálogo** desde Excel (normaliza encabezados y contenidos):  
  `EAN`, `Codigo_articulo`, `Descripcion`, `Unidades_por_bulto`, `Pesable`, `Pesable x un`
  > Se normalizan mayúsculas/minúsculas, espacios y comas → punto. `Pesable`/`Pesable x un` usan `1/0`.
- **Inventario de cantidades** con:
  - Escaneo de EAN (cámara) y entrada manual.
  - Tickets de balanza (p. ej. `21 + PLU + peso`): sugiere **peso** como cantidad.
  - Búsqueda por **PLU / código interno** (modal full‑screen).
  - Restricción _suave_ de decimales para **no pesables** (alerta con opción de continuar).
- **Inventario con vencimientos**:
  - Idéntico flujo (EAN / ticket / PLU) + **fecha de vencimiento** (DatePicker).
  - Validaciones: fecha válida y **posterior al día actual**.
- **Exportación unificada a Excel** (ambos flujos comparten columnas y orden):
  1. `ean`
  2. `codigo articulo`
  3. `descripcion`
  4. `unidades por bulto`
  5. `bultos`
  6. `cantidad`
  7. `fecha de ingreso` (fecha/hora de carga del ítem)
  8. `fecha de vencimiento` (**vacía** en inventario normal)
  - Hoja **resumen** incluida (metadatos del inventario).
- **Edición de nombre/observación** del inventario desde el header.
- **Compartir Excel** (WhatsApp/Drive/Email) con `expo-sharing`.

> 🔄 Se **eliminó** el campo `lote` del export con vencimiento para simplificar el análisis posterior en Tkinter.

---

## 🗂️ Estructura principal

```
inventario-rn/
  app/
    index.tsx
    _layout.tsx
    import/
      index.tsx
    inventory/
      new.tsx
      active.tsx                # Inventario de cantidades
      expiry.tsx                # Inventario con fecha de vencimiento
  components/
    PluSearchModal.tsx
  db/
    client.ts
    schema.ts
  features/
    catalog/
      catalogService.ts         # Importar Excel → SQLite
    inventory/
      inventoryService.ts       # CRUD inventarios e ítems
      exportInventory.ts        # Exportar (xlsx) unificado
      scale/
        scale.ts                # Lógica PLU / tickets balanza
        ScannerView.tsx
        useScanner.ts
  constants/
    colors.ts
  ...
```

---

## 🧠 Lógica de balanza / PLU (resumen)

- **Tickets pesables** (no por unidad): EAN tipo `21 + PLU + peso`.
  - Se extrae el **PLU** para encontrar el artículo y se **sugiere** el `pesoKg` como cantidad.
  - Si existe un EAN “base” (ej. `2100510000000`), se guarda ese; si no, el EAN del artículo.
- **PLU empacado**: lectura específica (ej.: etiqueta compacta con PLU al final).
- **Búsqueda PLU**: modal full-screen, teclado numérico, resultados scrolleables.

---

## 📦 Requisitos

- Node.js 18+
- Yarn o npm
- **Expo CLI** (opcional) y **EAS CLI** `>= 3.17.0`
- Cuenta de Expo/EAS y `projectId` en `app.json` (ya configurado).

---

## ▶️ Desarrollo local

Instalar dependencias y correr en modo dev:

```bash
npm install
npx expo start
```

- iOS/Android: escanear QR o usar emulador.
- Cámara: aceptar permiso la primera vez.
- Importar catálogo: desde la pantalla **Importar catálogo** (xlsx).

---

## 🏗️ Build de APK (Android)

Ya tenés un perfil `apk` en `eas.json`:

```json
{
  "cli": { "version": ">= 3.17.0", "appVersionSource": "local" },
  "build": {
    "apk": {
      "android": { "buildType": "apk" },
      "distribution": "internal",
      "developmentClient": false
    }
  }
}
```

### Pasos

1. Iniciar sesión en EAS:

```bash
npx eas login
```

2. Verificar el proyecto (una vez):

```bash
npx eas whoami
```

3. Lanzar build **APK** con el perfil `apk`:

```bash
npx eas build -p android --profile apk
```

4. Al finalizar, EAS te dará una **URL** para descargar el `.apk`.  
   Compartilo (WhatsApp / Drive) e **instalá** habilitando “Orígenes desconocidos” si es necesario.

> Nota: EAS generará y guardará automáticamente el **keystore** (a menos que subas uno propio).

---

## 🧾 Requisitos del Excel de **catálogo**

- Encabezados requeridos (en cualquier mayúscula/minúscula):  
  `EAN`, `Codigo_articulo`, `Descripcion`, `Unidades_por_bulto`, `Pesable`, `Pesable x un`
- Normalización:
  - Se quita `'` inicial en `EAN` (Excel suele exportarlo con apóstrofe).
  - Comas → punto en numéricos (ej. `1,00` → `1.00`).
  - `Pesable`/`Pesable x un` deben ser `1` o `0`.
- Se ignoran filas sin `EAN` o `Descripcion`.

---

## 🧰 Tips / Solución de problemas

- **Cámara**: si no aparece el permiso, volver a abrir el escáner; en iOS, revisar **Ajustes > Privacidad > Cámara**.
- **Importación**: si marca “Faltan columnas…”, verificar nombres exactos de encabezados.
- **Teclado tapa inputs**: Ajustado con `KeyboardAvoidingView`; opcionalmente puedes añadir en `app.json`:
  ```json
  "android": { "softwareKeyboardLayoutMode": "pan" }
  ```
- **Rendimiento de importación**: se insertan filas en **lotes** (batch).

---

## 🔜 Ideas futuras

- Respaldo/restauración de la **DB SQLite**.
- Filtros y alertas de **próximos vencimientos**.
- Etiquetado de ubicaciones (depósito / góndola).

---

## 📄 Licencia

Uso interno Aledo. Todos los derechos reservados.
