import { MeshTxBuilder, UTxO, IWallet } from "@meshsdk/core";
import { OracleScripts } from "../scripts";
import {
  TOKEN_NAMES,
  OracleConfiguration,
  OracleSettingsDatum,
  MintRedeemer,
  toSettingsDatum,
  toRewardAccountDatum,
  toEmptyAggStateDatum,
} from "../types";
import { walletConfig } from "../utils";

export type BootstrapParams = {
  wallet: IWallet;
  meshBuilder: MeshTxBuilder;
  oracleConf: OracleConfiguration;
  bootstrapUtxo: UTxO;           // Consuming this makes policy ID unique
  platformAuthNftUtxo: UTxO;     // Auth token remains at owner address
  initialSettings: OracleSettingsDatum;
  nftsRefUtxo: { txHash: string; outputIndex: number }; // Reference script for minting
};

/**
 * Initializes the Oracle protocol state.
 */
export async function bootstrapOracle(params: BootstrapParams): Promise<string> {
  const { wallet, meshBuilder, oracleConf, bootstrapUtxo, platformAuthNftUtxo, initialSettings, nftsRefUtxo } = params;

  const { changeAddress, walletUtxos, collateral } = await walletConfig(wallet);
  const networkId = await wallet.getNetworkId();
  const scripts = new OracleScripts(networkId);

  const manager = await scripts.oracleManager(oracleConf);
  const nfts = await scripts.oracleNfts(
    { txHash: bootstrapUtxo.input.txHash, outputIndex: bootstrapUtxo.input.outputIndex },
    oracleConf,
    manager.hash
  );
  
  const { policyId } = nfts;
  const lovelace = initialSettings.utxoSizeSafetyBuffer.toString();

  return meshBuilder
    // 1. Consume bootstrapUtxo (binds policy ID)
    .txIn(bootstrapUtxo.input.txHash, bootstrapUtxo.input.outputIndex)

    // 2. Auth NFT: spent + returned to source address (verify platform authority)
    .txIn(platformAuthNftUtxo.input.txHash, platformAuthNftUtxo.input.outputIndex)
    .txOut(platformAuthNftUtxo.output.address, platformAuthNftUtxo.output.amount)

    // 3. Mint the three protocol tokens using reference script
    .mintPlutusScriptV3()
    .mint("1", policyId, TOKEN_NAMES.coreSettings)
    .mintTxInReference(nftsRefUtxo.txHash, nftsRefUtxo.outputIndex)
    .mintRedeemerValue(MintRedeemer.MintToken(), "JSON")

    .mintPlutusScriptV3()
    .mint("1", policyId, TOKEN_NAMES.rewardAccount)
    .mintTxInReference(nftsRefUtxo.txHash, nftsRefUtxo.outputIndex)
    .mintRedeemerValue(MintRedeemer.MintToken(), "JSON")

    .mintPlutusScriptV3()
    .mint("1", policyId, TOKEN_NAMES.aggState)
    .mintTxInReference(nftsRefUtxo.txHash, nftsRefUtxo.outputIndex)
    .mintRedeemerValue(MintRedeemer.MintToken(), "JSON")

    // Output 0: CoreSettings (Mutable configuration)
    .txOut(manager.address, [
      { unit: "lovelace", quantity: lovelace },
      { unit: policyId + TOKEN_NAMES.coreSettings, quantity: "1" },
    ])
    .txOutInlineDatumValue(toSettingsDatum(initialSettings), "JSON")

    // Output 1: RewardAccount (Fee distribution)
    .txOut(manager.address, [
      { unit: "lovelace", quantity: lovelace },
      { unit: policyId + TOKEN_NAMES.rewardAccount, quantity: "1" },
    ])
    .txOutInlineDatumValue(toRewardAccountDatum([], 0), "JSON")

    // Output 2: AggState (Latest price data)
    .txOut(manager.address, [
      { unit: "lovelace", quantity: lovelace },
      { unit: policyId + TOKEN_NAMES.aggState, quantity: "1" },
    ])
    .txOutInlineDatumValue(toEmptyAggStateDatum(), "JSON")

    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .selectUtxosFrom(walletUtxos.filter(u => u.input.txHash !== bootstrapUtxo.input.txHash))
    .changeAddress(changeAddress)
    .complete();
}
