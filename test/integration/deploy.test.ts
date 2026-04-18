import { describe, it, expect, beforeAll } from "vitest";
import { BlockfrostProvider, MeshTxBuilder, MeshWallet, UTxO } from "@meshsdk/core";
import dotenv from "dotenv";
import {
  CharlieContract,
  OracleConfiguration,
  OracleSettingsDatum,
  resolveVKH,
} from "../../src";
import type { DeployedScripts } from "../../src/transactions/deployScripts";

dotenv.config();

const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;
const WALLET_MNEMONIC = process.env.WALLET_MNEMONIC;
const isConfigured = !!BLOCKFROST_API_KEY && !!WALLET_MNEMONIC;

const PREPROD_EXPLORER = "https://preprod.cardanoscan.io/transaction";

const oracleConf: OracleConfiguration = {
  // Replace with a real platform auth NFT policy ID for a live run
  platformAuthNft: "00000000000000000000000000000000000000000000000000000000",
  pausePeriodLength: 86400000,        // 24 h
  rewardDismissingPeriodLength: 604800000, // 7 days
};

const initialSettings: OracleSettingsDatum = {
  nodes: [],                          // populated in beforeAll from wallet VKH
  requiredNodeSignaturesCount: 1,
  feeInfo: {
    rateNft: null,
    rewardPrices: { nodeFee: 1_000_000, platformFee: 500_000 },
  },
  aggregationLivenessPeriod: 300_000,
  timeUncertaintyAggregation: 60_000,
  timeUncertaintyPlatform: 120_000,
  iqrFenceMultiplier: 150,
  medianDivergencyFactor: 100,
  utxoSizeSafetyBuffer: 2_000_000,
  pausePeriodStartedAt: null,
};

describe.skipIf(!isConfigured)(
  "Deployment workflow — Preprod (requires BLOCKFROST_API_KEY + WALLET_MNEMONIC)",
  () => {
    let contract: CharlieContract;
    let wallet: MeshWallet;
    let walletUtxos: UTxO[];
    let provider: BlockfrostProvider;

    // Shared across describe blocks — set by deployScripts test, read by bootstrap test
    let deployedRefs: DeployedScripts;
    let bootstrapUtxo: UTxO;

    beforeAll(async () => {
      provider = new BlockfrostProvider(BLOCKFROST_API_KEY!);
      wallet = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
          type: "mnemonic",
          words: WALLET_MNEMONIC!.split(" "),
        },
      });

      const meshBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });
      contract = new CharlieContract(wallet, meshBuilder, oracleConf);
      await contract.init();

      const unusedAddresses = await wallet.getUnusedAddresses();
      console.log("Wallet addresses (unused):", unusedAddresses);

      // Allow Blockfrost time to index the funded UTxO before querying
      await new Promise((resolve) => setTimeout(resolve, 10_000));

      walletUtxos = await wallet.getUtxos();

      if (walletUtxos.length === 0) {
        throw new Error(
          "Wallet has no UTxOs — send tADA to the Preprod wallet before running integration tests."
        );
      }

      // Seed the wallet VKH into settings nodes list
      initialSettings.nodes = [await resolveVKH(wallet)];

      // Reserve utxos[0] as the bootstrap UTxO — deployScripts explicitly avoids spending it
      bootstrapUtxo = walletUtxos[0];
    }, 60_000);

    describe("deployScripts()", () => {
      it(
        "deploys manager and nfts reference scripts, returns non-empty UTxO refs",
        async () => {
          const bootstrapUtxoRef = {
            txHash: bootstrapUtxo.input.txHash,
            outputIndex: bootstrapUtxo.input.outputIndex,
          };

          deployedRefs = await contract.deployScripts(bootstrapUtxoRef);

          expect(deployedRefs.managerRefUtxo.txHash).toMatch(/^[0-9a-f]{64}$/);
          expect(deployedRefs.nftsRefUtxo.txHash).toMatch(/^[0-9a-f]{64}$/);
          expect(deployedRefs.managerRefUtxo.outputIndex).toBe(0);
          expect(deployedRefs.nftsRefUtxo.outputIndex).toBe(0);

          console.log(
            `[Preprod] Manager ref TX:  ${PREPROD_EXPLORER}/${deployedRefs.managerRefUtxo.txHash}`
          );
          console.log(
            `[Preprod] NFTs policy TX:  ${PREPROD_EXPLORER}/${deployedRefs.nftsRefUtxo.txHash}`
          );
        },
        180_000 // 3 min — allows for network round-trip and mempool acceptance
      );
    });

    describe("bootstrap()", () => {
      beforeAll(async () => {
        // The nftsRefUtxo reference script must be confirmed on-chain before
        // bootstrap can resolve it. Poll Blockfrost until the UTxO is visible.
        const { txHash, outputIndex } = deployedRefs.nftsRefUtxo;
        console.log(`[Preprod] Waiting for nftsRefUtxo ${txHash}#${outputIndex} to confirm...`);
        for (let attempt = 0; attempt < 30; attempt++) {
          try {
            const utxos = await provider.fetchUTxOs(txHash);
            if (utxos.some((u) => u.input.outputIndex === outputIndex)) {
              console.log(`[Preprod] nftsRefUtxo confirmed after ${attempt + 1} poll(s)`);
              return;
            }
          } catch {
            // TX not yet indexed by Blockfrost — keep polling
          }
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        }
        throw new Error("nftsRefUtxo did not confirm within 5 minutes — aborting bootstrap");
      }, 330_000); // 5.5 min polling budget

      it(
        "bootstraps the oracle and returns a valid 64-char hex tx hash",
        async () => {
          const bootstrapTxHash = await contract.bootstrap({
            bootstrapUtxo,
            platformAuthNftUtxo: walletUtxos[1], // must hold the platform auth NFT
            initialSettings,
            nftsRefUtxo: deployedRefs.nftsRefUtxo,
          });

          expect(bootstrapTxHash).toMatch(/^[0-9a-f]{64}$/);
          console.log(`[Preprod] Bootstrap TX:     ${PREPROD_EXPLORER}/${bootstrapTxHash}`);
        },
        180_000 // 3 min
      );
    });
  }
);
