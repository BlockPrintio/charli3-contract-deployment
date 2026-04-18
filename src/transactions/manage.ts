import { IWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";
import { OracleScripts } from "../scripts";
import {
  OracleConfiguration,
  OracleSettingsDatum,
  OracleRedeemer,
  SettingsAction,
  toSettingsDatum,
} from "../types";
import { walletConfig } from "../utils";

export type ManageParams = {
  wallet: IWallet;
  meshBuilder: MeshTxBuilder;
  oracleConf: OracleConfiguration;
  scripts: OracleScripts;

  coreSettingsUtxo: UTxO;        // C3CS — will be spent
  platformAuthNftUtxo: UTxO;     // platform authorization NFT
  managerRefUtxo: { txHash: string; outputIndex: number }; // oracle_manager reference script

  updatedSettings: OracleSettingsDatum;
  action: number; // use SettingsAction constants
};

/**
 * Executes a governance action on the Oracle Settings.
 */
export async function manageOracle(params: ManageParams): Promise<string> {
  const {
    wallet, meshBuilder, oracleConf, scripts,
    coreSettingsUtxo, platformAuthNftUtxo, managerRefUtxo,
    updatedSettings, action,
  } = params;

  const { changeAddress, walletUtxos, collateral } = await walletConfig(wallet);
  const manager = await scripts.oracleManager(oracleConf);

  return meshBuilder
    // Spend CoreSettings UTxO using reference script
    .spendingPlutusScriptV3()
    .txIn(coreSettingsUtxo.input.txHash, coreSettingsUtxo.input.outputIndex)
    .txInRedeemerValue(OracleRedeemer.ManageSettings(action), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(managerRefUtxo.txHash, managerRefUtxo.outputIndex)

    // Verify platform authority (NFT in + NFT out)
    .txIn(platformAuthNftUtxo.input.txHash, platformAuthNftUtxo.input.outputIndex)
    .txOut(platformAuthNftUtxo.output.address, platformAuthNftUtxo.output.amount)

    // Updated CoreSettings output
    .txOut(manager.address, coreSettingsUtxo.output.amount)
    .txOutInlineDatumValue(toSettingsDatum(updatedSettings), "JSON")

    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .selectUtxosFrom(walletUtxos)
    .changeAddress(changeAddress)
    .complete();
}

/**
 * Convenience methods for common management tasks.
 */
export const updateSettings = (p: Omit<ManageParams, "action">) =>
  manageOracle({ ...p, action: SettingsAction.UpdateSettings });

export const addNodes = (p: Omit<ManageParams, "action">) =>
  manageOracle({ ...p, action: SettingsAction.AddNodes });

export const delNodes = (p: Omit<ManageParams, "action">) =>
  manageOracle({ ...p, action: SettingsAction.DelNodes });

export const pauseOracle = (p: Omit<ManageParams, "action">) =>
  manageOracle({ ...p, action: SettingsAction.PauseOracle });

export const resumeOracle = (p: Omit<ManageParams, "action">) =>
  manageOracle({ ...p, action: SettingsAction.ResumeOracle });
