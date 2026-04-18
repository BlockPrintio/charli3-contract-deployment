import {
  NativeScript,
  resolveNativeScriptAddress,
  deserializeAddress,
  resolveScriptHash,
  serializeNativeScript,
} from "@meshsdk/core";

/**
 * Utility to build Multi-Signature Native Scripts (Node/Platform Governance).
 */
export class NativeScriptBuilder {
  /**
   * Generates an M-of-N Native Script and its corresponding Bech32 address.
   * 
   * @param signers Array of Payment Key Hashes (PKHs) or Bech32 addresses.
   * @param threshold Number of required signatures (M).
   * @param networkId 0 for Testnet (default), 1 for Mainnet.
   * @returns The NativeScript object, its hash, and derived script address.
   */
  static buildMultisig(
    signers: string[],
    threshold: number,
    networkId: number = 0
  ): {
    nativeScript: NativeScript;
    scriptAddress: string;
  } {
    if (threshold > signers.length) {
      throw new Error("Threshold cannot be greater than the number of signers.");
    }

    const pkhs = signers.map((s) => {
      // If it looks like a Bech32 address, try to deserialize it
      if (s.startsWith("addr") || s.startsWith("stake")) {
        try {
          return deserializeAddress(s).pubKeyHash;
        } catch (e) {
          throw new Error(`Invalid address provided: ${s}`);
        }
      }
      // Otherwise assume it's already a 28-byte (56 hex char) VKH/PKH
      return s;
    });

    const nativeScript: NativeScript = {
      type: "atLeast",
      required: threshold,
      scripts: pkhs.map((pkh) => ({
        type: "sig",
        keyHash: pkh,
      })),
    };

    const scriptAddress = resolveNativeScriptAddress(nativeScript, networkId);

    return {
      nativeScript,
      scriptAddress,
    };
  }
}
