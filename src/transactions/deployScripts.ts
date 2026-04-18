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

  // Pick two distinct inputs — one per transaction — sorted descending by
  // lovelace so each TX gets a UTxO large enough to cover the deposit + fees.
  // Using explicit .txIn() avoids the shared-state accumulation bug in
  // MeshTxBuilder where selectUtxosFrom() appends across calls rather than
  // replacing, causing the coin selector to hit its maximum input count.
  const sorted = [...availableUtxos].sort((a, b) => {
    const lovelace = (u: UTxO) =>
      BigInt(u.output.amount.find((x) => x.unit === "lovelace")?.quantity ?? "0");
    return lovelace(a) < lovelace(b) ? 1 : -1;
  });

  if (sorted.length < 2) {
    throw new Error(
      "deployScripts requires at least 2 spendable UTxOs (excluding the bootstrap UTxO). " +
      "Split your wallet into more UTxOs before deploying."
    );
  }

  const input1 = sorted[0];
  const input2 = sorted[1];

  // Deploy manager
  const tx1Hex = await meshBuilder
    .txIn(input1.input.txHash, input1.input.outputIndex, input1.output.amount, input1.output.address)
    .txOut(targetAddress, [{ unit: "lovelace", quantity: minLovelace }])
    .txOutReferenceScript(manager.script.code, "V3")
    .changeAddress(changeAddress)
    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .complete();

  const signedTx1 = await wallet.signTx(tx1Hex);
  const managerRefTxHash = await wallet.submitTx(signedTx1);

  // complete() does not reset builder state — accumulated inputs from TX1 would
  // cause TX2 to hit the coin selector's maximum input count. Reset explicitly.
  meshBuilder.reset();

  // Deploy NFTs policy — uses a different input so it never double-spends TX1
  const tx2Hex = await meshBuilder
    .txIn(input2.input.txHash, input2.input.outputIndex, input2.output.amount, input2.output.address)
    .txOut(targetAddress, [{ unit: "lovelace", quantity: minLovelace }])
    .txOutReferenceScript(nfts.script.code, "V3")
    .changeAddress(changeAddress)
    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .complete();

  const signedTx2 = await wallet.signTx(tx2Hex);
  const nftsRefTxHash = await wallet.submitTx(signedTx2);

  return {
    managerRefUtxo: { txHash: managerRefTxHash, outputIndex: 0 },
    nftsRefUtxo: { txHash: nftsRefTxHash, outputIndex: 0 },
  };
}
