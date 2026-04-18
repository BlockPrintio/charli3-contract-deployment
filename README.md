# @blockprint/charli3-contract-deployment

<p align="center">
  <img src="https://raw.githubusercontent.com/charli3-oracle/charli3-pull-oracle-sdk/main/assets/logo.png" width="200" alt="Charli3 Logo">
</p>

A professional, class-based TypeScript library for deploying, bootstrapping, and managing **Charli3 Pull Oracle** contracts on the Cardano blockchain.

## ✨ Features

- 🏗️ **Class-based API**: Simple instantiation and management via the `CharlieContract` class.
- 🔐 **Multisig Governance**: Built-in `NativeScriptBuilder` for M-of-N governance.
- 🛡️ **Aiken v3 Ready**: Optimized for the latest Charli3 on-chain validators.
- 📦 **NPM First**: Standardized for integration into existing Node.js/TypeScript projects.
- ⚡ **Reference Scripts**: Automatic handling of reference scripts to stay within transaction limits.

## 🚀 Installation

```bash
npm install @blockprint/charli3-contract-deployment
```

## 🛠️ Usage

### 1. Initialize the Contract API

```typescript
import { CharlieContract, OracleConfiguration } from "@blockprint/charli3-contract-deployment";
import { MeshWallet, MeshTxBuilder, BlockfrostProvider } from "@meshsdk/core";

const provider = new BlockfrostProvider("your_project_id");
const wallet = new MeshWallet({
  networkId: 0, // Preprod
  fetcher: provider,
  submitter: provider,
  key: { type: "mnemonic", words: ["..."] },
});

const meshBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });

const oracleConf: OracleConfiguration = {
  platformAuthNft: "your_platform_auth_policy_id", 
  pausePeriodLength: 86400000, 
  rewardDismissingPeriodLength: 604800000,
};

const charli3 = new CharlieContract(wallet, meshBuilder, oracleConf);
await charli3.init();
```

### 2. Deployment Workflow

#### Step 1: Deploy Reference Scripts
Before bootstrapping, you must deploy the scripts as reference UTxOs.

```typescript
const utxos = await wallet.getUtxos();
const bootstrapUtxo = utxos[0]; // UTxO to be consumed for uniqueness

const refs = await charli3.deployScripts({
  txHash: bootstrapUtxo.input.txHash,
  outputIndex: bootstrapUtxo.input.outputIndex,
});

console.log("Manager Reference:", refs.managerRefUtxo);
console.log("NFTs Policy Reference:", refs.nftsRefUtxo);
```

#### Step 2: Bootstrap the Oracle
Initialize the protocol state (Settings, Rewards, and AggState).

```typescript
import { OracleSettingsDatum } from "@blockprint/charli3-contract-deployment";

const initialSettings: OracleSettingsDatum = {
  nodes: ["pkh_1", "pkh_2"],
  requiredNodeSignaturesCount: 1,
  feeInfo: {
    rateNft: null,
    rewardPrices: { nodeFee: 1000000, platformFee: 500000 },
  },
  aggregationLivenessPeriod: 300000,
  timeUncertaintyAggregation: 60000,
  timeUncertaintyPlatform: 120000,
  iqrFenceMultiplier: 150,
  medianDivergencyFactor: 25,
  utxoSizeSafetyBuffer: 2000000,
  pausePeriodStartedAt: null,
};

const txHash = await charli3.bootstrap({
  bootstrapUtxo,
  platformAuthNftUtxo: utxos[1],
  initialSettings,
  nftsRefUtxo: refs.nftsRefUtxo,
});
```

### 3. Management Actions

As a Node Manager, you can easily control the oracle lifecycle:

#### Update Node Settings & Operators
Easily update parameters or manage the operator list:

```typescript
// Add new nodes
await charli3.addNodes({
  coreSettingsUtxo,
  platformAuthNftUtxo,
  managerRefUtxo: refs.managerRefUtxo,
  newNodes: ["pkh_new_node"],
  currentSettings,
});

// Remove nodes
await charli3.removeNodes({
  coreSettingsUtxo,
  platformAuthNftUtxo,
  managerRefUtxo: refs.managerRefUtxo,
  nodesToRemove: ["pkh_old_node"],
  currentSettings,
});

// General parameters update
await charli3.updateSettings({
  coreSettingsUtxo,
  platformAuthNftUtxo,
  managerRefUtxo: refs.managerRefUtxo,
  updatedSettings,
});
```

#### Pause/Unpause Oracle
```typescript
// Pause
await charli3.pause({
  coreSettingsUtxo,
  platformAuthNftUtxo,
  managerRefUtxo: refs.managerRefUtxo,
  currentSettings,
  currentTime: Date.now(),
});

// Unpause
await charli3.unpause({
  coreSettingsUtxo,
  platformAuthNftUtxo,
  managerRefUtxo: refs.managerRefUtxo,
  currentSettings,
});
```

#### Update Parameters
```typescript
import { SettingsAction } from "@blockprint/charli3-contract-deployment";

await charli3.manage({
  coreSettingsUtxo,
  platformAuthNftUtxo,
  managerRefUtxo: refs.managerRefUtxo,
  updatedSettings,
  action: SettingsAction.UpdateSettings,
});
```

## 🤝 Governance (Multisig)

Use the `NativeScriptBuilder` to generate secure M-of-N governance addresses:

```typescript
import { NativeScriptBuilder } from "@blockprint/charli3-contract-deployment";

const signers = ["pkh1", "pkh2", "pkh3"];
const platform = NativeScriptBuilder.buildMultisig(signers, 2, 0); // 2-of-3

console.log("Governance Address:", platform.scriptAddress);
```

## 📄 License

MIT. Created by **BlockPrint**.
