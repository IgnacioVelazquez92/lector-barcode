// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// Habilitar carga de módulos WASM (requerido por expo-sqlite en Web)
config.resolver.assetExts.push("wasm");

module.exports = config;
