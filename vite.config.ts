import { fileURLToPath } from 'url';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// 👇 添加这一行，兼容 ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    plugins: [
      react(),
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron', 'electron-store', 'canvas', 'node-canvas', '@napi-rs/canvas'],
                output: {
                  entryFileNames: 'main.js',
                },
              },
            },
            resolve: {
              alias: {
                  '@': path.resolve(__dirname, 'src'),
                },
              },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart(args) {
            args.reload();
          },
          vite: {
            build: {
              outDir: 'dist-electron',
            },
            resolve: {
              alias: {
                  '@': path.resolve(__dirname, 'src'),
                },
              },
          },
        },
      ]),
      renderer(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@types': path.resolve(__dirname, 'src/types'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@services': path.resolve(__dirname, 'src/services'),
        '@stores': path.resolve(__dirname, 'src/stores'),
        '@hooks': path.resolve(__dirname, 'src/hooks'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@assets': path.resolve(__dirname, 'src/assets'),
      },
    },
    optimizeDeps: {
      include: ['pdfjs-dist', 'tesseract.js', 'react', 'react-dom', 'konva', 'react-konva'],
      exclude: ['@paddleocr/paddleocr-js'], // Exclude heavy OCR dependency from pre-bundling
      esbuildOptions: {
        target: 'es2022',
        treeShaking: true,
        supported: {
          'dynamic-import': true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: isDev,
      cssCodeSplit: true,
      minify: !isDev ? 'esbuild' : false,
      chunkSizeWarningLimit: 2000, // Increase chunk size warning limit
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-pdfjs': ['pdfjs-dist'],
            'vendor-konva': ['konva', 'react-konva'],
            'vendor-tesseract': ['tesseract.js'],
            'vendor-antd': ['antd'],
            'vendor-crypto': ['node-forge', 'sm-crypto'],
            'vendor-storage': ['zustand', 'electron-store'],
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
      },
    },
  };
});
