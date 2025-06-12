/***************************************************************************************************
 * POLYFILLS ESSENTIELS
 */

// Polyfill global
(window as any).global = window;

// Polyfill process
if (typeof (window as any).process === 'undefined') {
  (window as any).process = {
    env: {},
    version: '',
    cwd: () => '',
    nextTick: (callback: () => void) => setTimeout(callback, 0)
  };
}

// Polyfill Buffer
if (typeof (window as any).Buffer === 'undefined') {
  (window as any).Buffer = {
    isBuffer: () => false,
    from: (data: any) => new TextEncoder().encode(data),
    alloc: (size: number) => new Uint8Array(size)
  };
}

// Import des polyfills standards (conservez vos imports existants)
import 'zone.js/dist/zone';  // Existant