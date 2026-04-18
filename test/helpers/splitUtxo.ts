import { BlockfrostProvider, MeshTxBuilder, MeshWallet } from "@meshsdk/core";
import dotenv from "dotenv";

dotenv.config();

const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;
const WALLET_MNEMONIC = process.env.WALLET_MNEMONIC;

if (!BLOCKFROST_API_KEY || !WALLET_MNEMONIC) {
  console.error("Missing BLOCKFROST_API_KEY or WALLET_MNEMONIC in .env");
  process.exit(1);
}

async function main() {
  const provider = new BlockfrostProvider(BLOCKFROST_API_KEY!);
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: provider,
    submitter: provider,
    key: { type: "mnemonic", words: WALLET_MNEMONIC!.split(" ") },
  });

  const changeAddress = await wallet.getChangeAddress();
  console.log("Wallet address:", changeAddress);

  const utxos = await wallet.getUtxos();
  console.log("UTxOs before split:", JSON.stringify(utxos, null, 2));

  if (utxos.length === 0) {
    console.error("No UTxOs found — wallet may not be funded yet.");
    process.exit(1);
  }

  const meshBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });

  // Exclude UTxOs carrying reference scripts — spending them inflates tx size
  // and causes fee underestimation in the builder.
  const spendableUtxos = utxos.filter((u) => !u.output.scriptRef);
  console.log("Spendable UTxOs:", spendableUtxos.length);

  const txHex = await meshBuilder
    .txOut(changeAddress, [{ unit: "lovelace", quantity: "200000000" }])
    .txOut(changeAddress, [{ unit: "lovelace", quantity: "200000000" }])
    .txOut(changeAddress, [{ unit: "lovelace", quantity: "200000000" }])
    .changeAddress(changeAddress)
    .selectUtxosFrom(spendableUtxos)
    .complete();

  const signedTx = await wallet.signTx(txHex);
  const txHash = await wallet.submitTx(signedTx);

  console.log("Split TX submitted:", txHash);
  console.log("Explorer: https://preprod.cardanoscan.io/transaction/" + txHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
