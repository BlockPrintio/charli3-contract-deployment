import { IWallet, MeshTxBuilder, UTxO } from "@meshsdk/core";
import { OracleScripts } from "../scripts";
import { OracleConfiguration } from "../types";
import { walletConfig } from "../utils";

export type DeployedScripts = {
  managerRefUtxo: { txHash: string; outputIndex: number };
  nftsRefUtxo: { txHash: string; outputIndex: number };
};

export type DeployScriptsParams = {
  wallet: IWallet;
  meshBuilder: MeshTxBuilder;
  oracleConf: OracleConfiguration;
  bootstrapUtxoRef: { txHash: string; outputIndex: number };
  refScriptAddress?: string;
};

/**
 * Deploys the validator scripts as reference UTxOs.
 * This is a required step before bootstrap.
 */
export async function deployScripts(params: DeployScriptsParams): Promise<DeployedScripts> {
  const { wallet, meshBuilder, oracleConf, bootstrapUtxoRef, refScriptAddress } = params;

  const networkId = await wallet.getNetworkId();
  const scripts = new OracleScripts(networkId);
  const { changeAddress, walletUtxos, collateral } = await walletConfig(wallet);

  const manager = await scripts.oracleManager(oracleConf);
  const nfts = await scripts.oracleNfts(bootstrapUtxoRef, oracleConf, manager.hash);

  const targetAddress = refScriptAddress ?? changeAddress;
  const minLovelace = "65000000"; // ~65 ADA for large scripts

  // Protection: Don't spend the bootstrap UTxO
  const availableUtxos = walletUtxos.filter(
    (u) =>
      u.input.txHash !== bootstrapUtxoRef.txHash ||
      u.input.outputIndex !== bootstrapUtxoRef.outputIndex
  );

  // Deploy manager
  const tx1Hex = await meshBuilder
    .txOut(targetAddress, [{ unit: "lovelace", quantity: minLovelace }])
    .txOutReferenceScript(manager.script.code, "V3")
    .changeAddress(changeAddress)
    .selectUtxosFrom(availableUtxos)
    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .complete();

  const signedTx1 = await wallet.signTx(tx1Hex);
  const managerRefTxHash = await wallet.submitTx(signedTx1);

  // Deploy NFTs policy
  // Note: For a real library, the user might need to wait for TX1 to confirm 
  // before running TX2 if they don't have enough other UTxOs.
  // We'll leave the sequential logic to the CharlieContract wrapper or user.
  
  const tx2Hex = await meshBuilder
    .txOut(targetAddress, [{ unit: "lovelace", quantity: minLovelace }])
    .txOutReferenceScript(nfts.script.code, "V3")
    .changeAddress(changeAddress)
    .selectUtxosFrom(availableUtxos) // Re-use available
    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .complete();

  const signedTx2 = await wallet.signTx(tx2Hex);
  const nftsRefTxHash = await wallet.submitTx(signedTx2);

  return {
    managerRefUtxo: { txHash: managerRefTxHash, outputIndex: 0 },
    nftsRefUtxo: { txHash: nftsRefTxHash, outputIndex: 0 },
  };
}
