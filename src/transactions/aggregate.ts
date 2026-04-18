import { IWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";
import { OracleScripts } from "../scripts";
import {
  OracleConfiguration,
  OracleRedeemer,
  toAggStateDatum,
  toRewardAccountDatum,
} from "../types";
import { walletConfig } from "../utils";

export type AggregateParams = {
  wallet: IWallet;
  meshBuilder: MeshTxBuilder;
  oracleConf: OracleConfiguration;
  scripts: OracleScripts;

  // Protocol UTxOs
  rewardAccountUtxo: UTxO;
  aggStateUtxo: UTxO;
  coreSettingsUtxo: UTxO;    // Read-only / Reference input
  managerRefUtxo: { txHash: string; outputIndex: number };

  // Data
  nodeFeeds: Map<string, number>;
  medianPrice: number;
  currentTime: number;
  expirationTime: number;

  // Fee calculation outputs
  rewardAccountOutputAmount: { unit: string; quantity: string }[];
  updatedRewards: {
    nodesToRewards: [string, number][];
    lastUpdateTime: number;
  };
};

/**
 * Performs On-Demand Validation (ODV) aggregation and updates on-chain price state.
 */
export async function aggregatePrice(params: AggregateParams): Promise<string> {
  const {
    wallet,
    meshBuilder,
    oracleConf,
    scripts,
    rewardAccountUtxo,
    aggStateUtxo,
    coreSettingsUtxo,
    managerRefUtxo,
    nodeFeeds,
    medianPrice,
    currentTime,
    expirationTime,
    rewardAccountOutputAmount,
    updatedRewards,
  } = params;

  const { changeAddress, walletUtxos, collateral } = await walletConfig(wallet);
  const manager = await scripts.oracleManager(oracleConf);

  return meshBuilder
    // 1. Spend RewardAccount (Fee handling)
    .spendingPlutusScriptV3()
    .txIn(rewardAccountUtxo.input.txHash, rewardAccountUtxo.input.outputIndex)
    .txInRedeemerValue(OracleRedeemer.OdvAggregate(nodeFeeds), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(managerRefUtxo.txHash, managerRefUtxo.outputIndex)

    // 2. Spend AggState (Price update)
    .spendingPlutusScriptV3()
    .txIn(aggStateUtxo.input.txHash, aggStateUtxo.input.outputIndex)
    .txInRedeemerValue(OracleRedeemer.OdvAggregateMsg(), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(managerRefUtxo.txHash, managerRefUtxo.outputIndex)

    // 3. Reference CoreSettings (Validation parameters)
    .readOnlyTxInReference(coreSettingsUtxo.input.txHash, coreSettingsUtxo.input.outputIndex)

    // 4. Update RewardAccount Output
    .txOut(manager.address, rewardAccountOutputAmount)
    .txOutInlineDatumValue(
      toRewardAccountDatum(updatedRewards.nodesToRewards, updatedRewards.lastUpdateTime),
      "JSON"
    )

    // 5. Update AggState Output with new price
    .txOut(manager.address, aggStateUtxo.output.amount)
    .txOutInlineDatumValue(
      toAggStateDatum(medianPrice, currentTime, expirationTime),
      "JSON"
    )

    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .selectUtxosFrom(walletUtxos)
    .changeAddress(changeAddress)
    // Range: currentTime to currentTime + 5 mins (buffer)
    .invalidBefore(currentTime)
    .invalidHereafter(currentTime + 300_000)
    .complete();
}
