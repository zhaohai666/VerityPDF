/// <reference types="vite/client" />

declare module '*.pdf' {
  const src: string;
  export default src;
}

interface Window {
  verityAPI: import('./src/types/electron').VerityAPI;
}
