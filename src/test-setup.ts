import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

if (typeof window !== 'undefined' && !window.BroadcastChannel && typeof globalThis.BroadcastChannel !== 'undefined') {
  window.BroadcastChannel = globalThis.BroadcastChannel
}

// Polyfill en memoria para localStorage en el entorno de pruebas Node.js (Vitest)
// cuando las advertencias experimentales de Node deshabilitan la API global en el runner.
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage || typeof globalThis.localStorage.setItem !== 'function') {
  const store = new Map<string, string>()
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  })
}

if (typeof globalThis.sessionStorage === 'undefined' || !globalThis.sessionStorage || typeof globalThis.sessionStorage.setItem !== 'function') {
  const store = new Map<string, string>()
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  })
}
