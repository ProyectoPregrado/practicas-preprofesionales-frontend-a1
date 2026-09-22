import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

if (typeof window !== 'undefined' && !window.BroadcastChannel && typeof globalThis.BroadcastChannel !== 'undefined') {
  window.BroadcastChannel = globalThis.BroadcastChannel
}

