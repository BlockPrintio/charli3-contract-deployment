import { IWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";
import { OracleScripts } from "../scripts";
import {
  OracleConfiguration,
  OracleRedeemer,
  toRewardAccountDatum,
} from "../types";
import { walletConfig } from "../utils";

export type CollectParams = {
  wallet: IWallet;
  meshBuilder: MeshTxBuilder;
  oracleConf: OracleConfiguration;
  scripts: OracleScripts;

  isPlatform: boolean;           // true if platform is claiming its fee
  rewardAccountUtxo: UTxO;
  coreSettingsUtxo: UTxO;        // Reference input
  managerRefUtxo: { txHash: string; outputIndex: number };

  nodeVkh?: string;              // Required if node is claiming
  rewardAccountOutputIndex: number;
  rewardAccountOutputAmount: { unit: string; quantity: string }[];
  updatedRewardDatum: { nodesToRewards: [string, number][]; lastUpdateTime: number };
};

/**
 * Claims rewards from the protocol for either a Node Operator or the Platform.
 */
export async function collectRewards(params: CollectParams): Promise<string> {
  const {
    wallet,
    meshBuilder,
    oracleConf,
    scripts,
    isPlatform,
    rewardAccountUtxo,
    coreSettingsUtxo,
    managerRefUtxo,
    nodeVkh,
    rewardAccountOutputIndex,
    rewardAccountOutputAmount,
    updatedRewardDatum,
  } = params;

  const { changeAddress, walletUtxos, collateral } = await walletConfig(wallet);
  const manager = await scripts.oracleManager(oracleConf);

  return meshBuilder
    // 1. Spend RewardAccount
    .spendingPlutusScriptV3()
    .txIn(rewardAccountUtxo.input.txHash, rewardAccountUtxo.input.outputIndex)
    .txInRedeemerValue(OracleRedeemer.RedeemRewards(isPlatform, rewardAccountOutputIndex), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(managerRefUtxo.txHash, managerRefUtxo.outputIndex)

    // 2. Reference CoreSettings
    .readOnlyTxInReference(coreSettingsUtxo.input.txHash, coreSettingsUtxo.input.outputIndex)

    // 3. Update RewardAccount Output
    .txOut(manager.address, rewardAccountOutputAmount)
    .txOutInlineDatumValue(
      toRewardAccountDatum(updatedRewardDatum.nodesToRewards, updatedRewardDatum.lastUpdateTime),
      "JSON"
    )

    // 4. Withdrawal verification (Multi-sig or Signer check)
    // If it's a node, they must sign. If it's platform, platform script must be satisfied.
    .requiredSignerHash(isPlatform ? "" : nodeVkh!)

    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .selectUtxosFrom(walletUtxos)
    .changeAddress(changeAddress)
    .complete();
}
