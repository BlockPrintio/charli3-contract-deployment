import { BlockfrostProvider, deserializeAddress, IWallet, MeshTxBuilder, MeshWallet, UTxO } from "@meshsdk/core";
export const provider = new BlockfrostProvider("preprodMQggHR4gEPIjPNEs1VGGYTeius33Bmc6");
/** Resolves wallet state in one call. Throws if no collateral is set. */
export const walletConfig = async (wallet: IWallet) => {
  const [changeAddress, walletUtxos, collateralUtxos] = await Promise.all([
    wallet.getChangeAddress(),
    wallet.getUtxos(),
    wallet.getCollateral(),
  ]);

  if (!collateralUtxos.length) throw new Error("No collateral UTxOs found in wallet");

  return { changeAddress, walletUtxos, collateral: collateralUtxos[0] };
};

/** Finds a UTxO holding a specific NFT (policyId + assetName). */
export const findUtxoWithNft = (
  utxos: UTxO[],
  policyId: string,
  assetName: string
): UTxO | undefined => {
  const unit = policyId + assetName;
  return utxos.find((u) => u.output.amount.some((a) => a.unit === unit));
};

/** Signs a tx with wallet and submits; returns txHash. */
export const signAndSubmit = async (
  wallet: IWallet,
  txHex: string
): Promise<string> => {
  const signed = await wallet.signTx(txHex, true);
  return wallet.submitTx(signed);
};

const MNEMONIC1 = "rotate loyal pilot rude sing stage lamp gaze series cram earth advance defy lemon obscure inside shy draft leisure boy night type giant focus";

const MNEMONIC2 = "wrong wish today kangaroo journey shiver system island list pass sport brown grass photo cry elbow attend fetch exile pill unique entry copper drink";

const MNEMONIC3 = "inch hire hungry lend logic chicken claw ketchup leopard shell spike impulse surprise ramp today oppose dinosaur cherry sock rural blue solid eager fossil";

const MNEMONIC4 = "stumble bitter surface front elegant mandate slam vicious wish regret yard electric erode nasty spray talent fantasy phrase assault purpose camp blood target physical";

export const node1 = new MeshWallet({
  networkId: 0,
  fetcher: provider,
  submitter: provider,
  key: { type: "mnemonic", words: MNEMONIC1.split(" ")},
});


export const node2 = new MeshWallet({
  networkId: 0,
  fetcher: provider,
  submitter: provider,
  key: { type: "mnemonic", words: MNEMONIC2.split(" ") },
});


export const node3 = new MeshWallet({
  networkId: 0,
  fetcher: provider,
  submitter: provider,
  key: { type: "mnemonic", words: MNEMONIC3.split(" ") },
});


export const node4 = new MeshWallet({
  networkId: 0,
  fetcher: provider,
  submitter: provider,
  key: { type: "mnemonic", words: MNEMONIC4.split(" ") },
});

export const resolveVKH = async (wallet: IWallet) => {
  const vkh = deserializeAddress(await wallet.getChangeAddress()).pubKeyHash;
  return vkh;
}
  

"63fb25158563dd7e45300fe997604f00579f14dacc3edc414e8d8755"
"598c7c94f56a456b01d31139d33fa3392266dd1eec7fc2e115283fc8"