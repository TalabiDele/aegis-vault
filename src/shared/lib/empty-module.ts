// Shim for optional @x402/* transitive modules referenced by @coinbase/cdp-sdk
function unsupportedX402(): never {
  throw new Error("Optional @x402 payment module is not enabled in AegisVault.");
}

export const toClientEvmSigner = unsupportedX402;
export const x402Client = unsupportedX402;
export const registerExactEvmScheme = unsupportedX402;
export const UptoEvmScheme = unsupportedX402;
export const registerExactSvmScheme = unsupportedX402;
export default {};
