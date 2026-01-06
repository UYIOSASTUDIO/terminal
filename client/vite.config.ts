import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
    plugins: [
        react(),
        wasm(),
        topLevelAwait()
    ],
    // HIER IST DER FIX:
    server: {
        host: true, // Erlaubt Zugriff über 127.0.0.1 und Netzwerk-IPs
        port: 5173,
    }
})