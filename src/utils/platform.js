// True only inside the Capacitor iOS shell. The native bridge defines
// `Capacitor` before any page script runs; browsers and `node --test` have no
// such global, so no Capacitor code is bundled into the web build for this.
export const isNativePlatform = () => globalThis.Capacitor?.isNativePlatform?.() === true;
