import {
  IWallet,
  MeshTxBuilder,
  UTxO,
  Asset,
} from "@meshsdk/core";
import { OracleScripts } from "./scripts";
import {
  OracleConfiguration,
  OracleSettingsDatum,
  TOKEN_NAMES,
  SettingsAction,
} from "./types";
import {
  bootstrapOracle,
} from "./transactions/bootstrap";
import {
  manageOracle,
} from "./transactions/manage";
import {
  deployScripts,
  DeployedScripts,
} from "./transactions/deployScripts";
import { findUtxoWithNft } from "./utils";

export class CharlieContract {
  private scripts: OracleScripts;
  private networkId: number;

  constructor(
    private readonly wallet: IWallet,
    private readonly meshBuilder: MeshTxBuilder,
    private readonly oracleConf: OracleConfiguration
  ) {
    // We'll resolve networkId from wallet soon, but for now we expect it to be ready
    // Or we can lazy-init it.
    this.networkId = 0; // Default to testnet
    this.scripts = new OracleScripts(this.networkId);
  }

  async init() {
    this.networkId = await this.wallet.getNetworkId();
    this.scripts = new OracleScripts(this.networkId);
  }

  /**
   * Deploys reference scripts on-chain.
   */
  async deployScripts(bootstrapUtxoRef: { txHash: string; outputIndex: number }) {
    return deployScripts({
      wallet: this.wallet,
      meshBuilder: this.meshBuilder,
      oracleConf: this.oracleConf,
      bootstrapUtxoRef,
    });
  }

  /**
   * Initializes the oracle state (CoreSettings, RewardAccount, AggState).
   */
  async bootstrap(params: {
    bootstrapUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    initialSettings: OracleSettingsDatum;
    nftsRefUtxo: { txHash: string; outputIndex: number };
  }) {
    return bootstrapOracle({
      ...params,
      wallet: this.wallet,
      meshBuilder: this.meshBuilder,
      oracleConf: this.oracleConf,
    });
  }

  /**
   * Generic management method.
   */
  async manage(params: {
    coreSettingsUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    managerRefUtxo: { txHash: string; outputIndex: number };
    updatedSettings: OracleSettingsDatum;
    action: number;
  }) {
    return manageOracle({
      ...params,
      wallet: this.wallet,
      meshBuilder: this.meshBuilder,
      oracleConf: this.oracleConf,
      scripts: this.scripts,
    });
  }

  /**
   * Convenience: Pause the oracle.
   * This updates the pausePeriodStartedAt field to the current time.
   */
  async pause(params: {
    coreSettingsUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    managerRefUtxo: { txHash: string; outputIndex: number };
    currentSettings: OracleSettingsDatum;
    currentTime: number;
  }) {
    const updatedSettings: OracleSettingsDatum = {
      ...params.currentSettings,
      pausePeriodStartedAt: params.currentTime,
    };
    return this.manage({
      coreSettingsUtxo: params.coreSettingsUtxo,
      platformAuthNftUtxo: params.platformAuthNftUtxo,
      managerRefUtxo: params.managerRefUtxo,
      updatedSettings,
      action: SettingsAction.PauseOracle,
    });
  }

  /**
   * Convenience: Unpause (resume) the oracle.
   */
  async unpause(params: {
    coreSettingsUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    managerRefUtxo: { txHash: string; outputIndex: number };
    currentSettings: OracleSettingsDatum;
  }) {
    const updatedSettings: OracleSettingsDatum = {
      ...params.currentSettings,
      pausePeriodStartedAt: null,
    };
    return this.manage({
      coreSettingsUtxo: params.coreSettingsUtxo,
      platformAuthNftUtxo: params.platformAuthNftUtxo,
      managerRefUtxo: params.managerRefUtxo,
      updatedSettings,
      action: SettingsAction.ResumeOracle,
    });
  }

  /**
   * Convenience: Update general oracle settings (consensus, fees, etc.)
   */
  async updateSettings(params: {
    coreSettingsUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    managerRefUtxo: { txHash: string; outputIndex: number };
    updatedSettings: OracleSettingsDatum;
  }) {
    return this.manage({
      ...params,
      action: SettingsAction.UpdateSettings,
    });
  }

  /**
   * Convenience: Add new node operators.
   */
  async addNodes(params: {
    coreSettingsUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    managerRefUtxo: { txHash: string; outputIndex: number };
    newNodes: string[];
    currentSettings: OracleSettingsDatum;
  }) {
    const updatedSettings: OracleSettingsDatum = {
      ...params.currentSettings,
      nodes: [...new Set([...params.currentSettings.nodes, ...params.newNodes])],
    };
    return this.manage({
      coreSettingsUtxo: params.coreSettingsUtxo,
      platformAuthNftUtxo: params.platformAuthNftUtxo,
      managerRefUtxo: params.managerRefUtxo,
      updatedSettings,
      action: SettingsAction.AddNodes,
    });
  }

  /**
   * Convenience: Remove node operators.
   */
  async removeNodes(params: {
    coreSettingsUtxo: UTxO;
    platformAuthNftUtxo: UTxO;
    managerRefUtxo: { txHash: string; outputIndex: number };
    nodesToRemove: string[];
    currentSettings: OracleSettingsDatum;
  }) {
    const updatedSettings: OracleSettingsDatum = {
      ...params.currentSettings,
      nodes: params.currentSettings.nodes.filter(n => !params.nodesToRemove.includes(n)),
    };
    return this.manage({
      coreSettingsUtxo: params.coreSettingsUtxo,
      platformAuthNftUtxo: params.platformAuthNftUtxo,
      managerRefUtxo: params.managerRefUtxo,
      updatedSettings,
      action: SettingsAction.DelNodes,
    });
  }

  /**
   * Helper to find protocol UTxOs based on the minted PolicyID.
   */
  async findProtocolUtxos(policyId: string, managerAddress: string, provider: { fetchAddressUtxos: (addr: string) => Promise<UTxO[]> }) {
    const utxos = await provider.fetchAddressUtxos(managerAddress);
    return {
      coreSettings: findUtxoWithNft(utxos, policyId, TOKEN_NAMES.coreSettings),
      rewardAccount: findUtxoWithNft(utxos, policyId, TOKEN_NAMES.rewardAccount),
      aggState: findUtxoWithNft(utxos, policyId, TOKEN_NAMES.aggState),
    };
  }
}
