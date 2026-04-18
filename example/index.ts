import {
  BlockfrostProvider,
  MeshTxBuilder,
  MeshWallet,
} from "@meshsdk/core";
import {
  CharlieContract,
  NativeScriptBuilder,
  OracleConfiguration,
  OracleSettingsDatum,
  resolveVKH,
} from "../src";

/**
 * Example: Full Deployment Flow using the @blockprint/charli3-contract-deployment library.
 */
async function main() {
  // 1. Setup Provider & Wallet
  // Ensure you have these environment variables set or replace with strings
  const provider = new BlockfrostProvider(process.env.BLOCKFROST_PROJECT_ID!);
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: provider,
    submitter: provider,
    key: {
      type: "mnemonic",
      words: (process.env.WALLET_MNEMONIC!).split(" "),
    },
  });

  const meshBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });

  console.log("Wallet Address:", await wallet.getChangeAddress());

  // 2. Project Governance: Build Platform Multisig (e.g. 2-of-3)
  const signers = [
    await resolveVKH(wallet), // Use your own wallet for this demo
    "pkh_of_second_governor...",
    "pkh_of_third_governor...",
  ];
  const platform = NativeScriptBuilder.buildMultisig(signers, 1, 0); // 1-of-1 for demo
  console.log("Platform Multisig Address:", platform.scriptAddress);

  // 3. Define Oracle Configuration (Immutable Validator Params)
  // This usually requires a platform authorized NFT. For the demo, we assume 
  // you already minted one and it's in your wallet.
  const oracleConf: OracleConfiguration = {
    platformAuthNft: "your_platform_auth_policy_id", 
    pausePeriodLength: 86400000,      // 24h
    rewardDismissingPeriodLength: 604800000, // 7 days
    // feeToken: { policyId: "...", assetName: "..." } // Optional
  };

  const charli3 = new CharlieContract(wallet, meshBuilder, oracleConf);
  await charli3.init();

  // 4. Step 1: Deploy Reference Scripts (Required once)
  // We need a UTxO ref that will be consumed in the bootstrap tx.
  const utxos = await wallet.getUtxos();
  const bootstrapUtxo = utxos[0]; 
  
  console.log("Deploying reference scripts...");
  const refs = await charli3.deployScripts({
    txHash: bootstrapUtxo.input.txHash,
    outputIndex: bootstrapUtxo.input.outputIndex,
  });
  console.log("Reference Scripts Deployed:", refs);

  // 5. Step 2: Bootstrap the Oracle
  const initialSettings: OracleSettingsDatum = {
    nodes: [await resolveVKH(wallet)], // Just yourself for the demo
    requiredNodeSignaturesCount: 1,
    feeInfo: {
      rateNft: null, // ADA based
      rewardPrices: { nodeFee: 1000000, platformFee: 500000 },
    },
    aggregationLivenessPeriod: 300000,
    timeUncertaintyAggregation: 60000,
    timeUncertaintyPlatform: 120000,
    iqrFenceMultiplier: 150,
    medianDivergencyFactor: 100,
    utxoSizeSafetyBuffer: 2000000,
    pausePeriodStartedAt: null,
  };

  console.log("Bootstrapping Oracle...");
  const bootstrapTxHash = await charli3.bootstrap({
    bootstrapUtxo,
    platformAuthNftUtxo: utxos[1], // Assumes this one has the platform NFT
    initialSettings,
    nftsRefUtxo: refs.nftsRefUtxo,
  });
  console.log("Oracle Bootstrapped! TX:", bootstrapTxHash);

  // 6. Management Actions (Optional)
  // deploy.pause(...) or deploy.manage(...)
}

main().catch(console.error);
