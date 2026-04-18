import {
  applyParamsToScript,
  byteString,
  conStr0,
  integer,
  PlutusScript,
  resolveScriptHash,
  serializePlutusScript,
} from "@meshsdk/core";
import plutusBlueprint from "./plutus.json";
import { OracleConfiguration, toOracleConfigData } from "./types";

/**
 * Resolves parameterized scripts from plutus.json.
 */
export class OracleScripts {
  constructor(private readonly networkId: number) {}

  private findCompiledCode(title: string): string {
    const match = (plutusBlueprint as any).validators.find(
      (v: any) => v.title === title
    );
    if (!match) throw new Error(`Validator not found: ${title}`);
    return match.compiledCode;
  }

  private toAddress(script: PlutusScript): string {
    return serializePlutusScript(script, undefined, this.networkId, false).address;
  }

  /**
   * Builds the oracle_manager spending validator applied to OracleConfiguration.
   */
  async oracleManager(conf: OracleConfiguration) {
    const cbor = applyParamsToScript(
      this.findCompiledCode("oracle.oracle_manager.spend"),
      [toOracleConfigData(conf)],
      "JSON"
    );
    const script: PlutusScript = { code: cbor, version: "V3" };
    const hash = resolveScriptHash(cbor, "V3");
    return { script, hash, address: this.toAddress(script) };
  }

  /**
   * Builds the oracle_nfts minting policy applied to NftsConfiguration.
   * @param utxoRef The specific UTxO consumed in the bootstrap tx (unique policy ID).
   */
  async oracleNfts(
    utxoRef: { txHash: string; outputIndex: number },
    conf: OracleConfiguration,
    managerHash: string
  ) {
    // NftsConfiguration: Constr(0, [OutputReference, OracleConfiguration, ScriptHash])
    const nftsConf = conStr0([
      // OutputReference: Constr(0, [txHash: ByteArray, outputIndex: Int])
      conStr0([
        byteString(utxoRef.txHash),
        integer(utxoRef.outputIndex),
      ]),
      toOracleConfigData(conf),
      byteString(managerHash), 
    ]);

    const cbor = applyParamsToScript(
      this.findCompiledCode("oracle.oracle_nfts.mint"),
      [nftsConf],
      "JSON"
    );
    const script: PlutusScript = { code: cbor, version: "V3" };
    const policyId = resolveScriptHash(cbor, "V3");
    return { script, policyId };
  }
}
