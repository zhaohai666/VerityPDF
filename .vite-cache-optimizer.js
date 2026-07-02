/**
 * Vite cache optimizer for better build performance
 */
import fs from 'fs-extra';
import path from 'path';

const CACHE_DIR = path.resolve(process.cwd(), 'node_modules/.vite-cache');
const OPTIMIZED_MODULES = [
  'pdfjs-dist',
  'tesseract.js',
  'konva',
  'react-konva',
  'antd',
  'zustand'
];

/**
 * Pre-optimize large dependencies for faster startup
 */
export async function optimizeCache() {
  try {
    await fs.ensureDir(CACHE_DIR);
    
    for (const module of OPTIMIZED_MODULES) {
      const modulePath = require.resolve(module);
      const cachePath = path.join(CACHE_DIR, `${module.replace(/\//g, '-')}.js`);
      
      if (!(await fs.pathExists(cachePath))) {
        console.log(`Optimizing ${module}...`);
        const code = await fs.readFile(modulePath, 'utf8');
        await fs.writeFile(cachePath, code);
      }
    }
    
    console.log('Cache optimization completed.');
  } catch (error) {
    console.warn('Cache optimization failed:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  optimizeCache();
}