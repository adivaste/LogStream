import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// Chrome MV3 requires background.service_worker; Firefox MV3 doesn't support
// service workers at all and needs background.scripts instead - the two
// manifests can't be merged into one file, so each target gets its own
// source manifest (manifests/manifest.<target>.json) copied into place as
// manifest.json after the build, and its own dist/<target> output directory
// so `npm run build:chrome` and `npm run build:firefox` never clobber each
// other's output.
const target = process.env.TARGET === 'firefox' ? 'firefox' : 'chrome'
const outDir = path.resolve(__dirname, 'dist', target)

const writeManifestPlugin = () => ({
    name: 'write-target-manifest',
    closeBundle() {
        const src = path.resolve(__dirname, 'manifests', `manifest.${target}.json`)
        const dest = path.resolve(outDir, 'manifest.json')

        fs.copyFileSync(src, dest)
    }
})

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss(), writeManifestPlugin()],
    build: {
        outDir,
        rollupOptions: {
            input: {
                main: 'index.html',
                background: path.resolve(__dirname, 'src/background/index.ts')
            },
            output: {
                entryFileNames: (chunkInfo) => (
                    chunkInfo.name === 'background'
                        ? 'background.js'
                        : 'assets/[name]-[hash].js'
                ),
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]'
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    }
})
