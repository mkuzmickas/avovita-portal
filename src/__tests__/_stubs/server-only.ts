// Test-only stub for the `server-only` guard module. Importing the real
// module from vitest throws because it isn't running inside Next's RSC
// graph; this no-op replacement lets us unit-test server modules.
export {};
