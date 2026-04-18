import {
  Asset,
  deserializeAddress,
  IWallet,
  UTxO,
} from "@meshsdk/core";

/**
 * Common configuration for wallet-based transactions.
 */
export async function walletConfig(wallet: IWallet) {
  const [changeAddress, walletUtxos, collateral] = await Promise.all([
    wallet.getChangeAddress(),
    wallet.getUtxos(),
    wallet.getCollateral(),
  ]);

  if (!collateral || collateral.length === 0) {
    throw new Error("No collateral UTxO found in wallet.");
  }

  return { changeAddress, walletUtxos, collateral: collateral[0] };
}

/**
 * Finds a UTxO containing a specific NFT (PolicyId + TokenName).
 */
export function findUtxoWithNft(utxos: UTxO[], policyId: string, tokenNameHex: string): UTxO | undefined {
  const unit = policyId + tokenNameHex;
  return utxos.find((u) => 
    u.output.amount.some((a: Asset) => a.unit === unit)
  );
}

/**
 * Resolves the Payment Key Hash (PKH) from a wallet's change address.
 */
export async function resolveVKH(wallet: IWallet): Promise<string> {
  const addr = await wallet.getChangeAddress();
  return deserializeAddress(addr).pubKeyHash;
}

/**
 * Signs and submits a transaction hex, returning the TX hash.
 */
export async function signAndSubmit(wallet: IWallet, txHex: string): Promise<string> {
  const signedTx = await wallet.signTx(txHex);
  const txHash = await wallet.submitTx(signedTx);
  return txHash;
}
