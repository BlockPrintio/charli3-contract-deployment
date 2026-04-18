/**
 * types.ts — Plutus data serialisation for the Charli3 Pull Oracle
 *
 * Every schema here is cross-checked against plutus.json definitions.
 * Constructor indices come directly from the blueprint JSON file.
 *
 * Key plutus.json facts:
 *   ext/cardano/value/Asset     = Constr(0, [policy_id:bytes, name:bytes])
 *   Option<Asset>  Some         = Constr(0, [Asset])  ← Asset itself is Constr(0,[...])
 *   Option<Asset>  None         = Constr(1, [])
 *   Option<PosixTime> Some      = Constr(0, [Int])
 *   Option<PosixTime> None      = Constr(1, [])
 *   FeeConfig                   = Constr(0, [Option<Asset>, RewardPrices])
 *   RewardPrices                = Constr(0, [Int, Int])
 *   OracleConfiguration         = Constr(0, [bytes, Int, Int, Option<Asset>])
 *   NftsConfiguration           = Constr(0, [OutputReference, OracleConfiguration, ScriptHash])
 *   OutputReference             = Constr(0, [bytes, Int])
 *   OracleDatum: AggState=0, OracleSettings=1, RewardAccount=2
 *   MintingRedeemer: MintToken=0, ScaleToken=1, BurnToken=2
 *   OracleRedeemer: OdvAggregate=0, OdvAggregateMsg=1, RedeemRewards=2, ManageSettings=3, ScaleDown=4, DismissRewards=5
 *   RewardRedeemer: NodeCollect=0, PlatformCollect=1
 *   SettingsRedeemer: UpdateSettings=0, AddNodes=1, DelNodes=2, PauseOracle=3, ResumeOracle=4, RemoveOracle=5
 *
 * NOTE: `none` is NOT exported by @meshsdk/core — use conStr1([]) for None variants.
 */

import {
  byteString,
  conStr,
  conStr0,
  conStr1,
  conStr2,
  integer,
  list,
  mConStr0,
  mConStr1,
  mConStr2,
  stringToHex,
} from "@meshsdk/core";

// ---------------------------------------------------------------------------
// Protocol Token Names — hardcoded in the compiled contract (config.ak)
// Always hex-encoded with stringToHex before hitting the chain.
// ---------------------------------------------------------------------------
export const TOKEN_NAMES = {
  coreSettings: stringToHex("C3CS"),   // hex: "43334353"
  rewardAccount: stringToHex("C3RA"),  // hex: "43335241"
  aggState:      stringToHex("C3AS"),  // hex: "43334153"
} as const;

// ---------------------------------------------------------------------------
// TypeScript mirror types
// ---------------------------------------------------------------------------

/**
 * policyId : hex PolicyId string  (28 bytes = 56 hex chars)
 * assetName: hex AssetName string (already hex — use stringToHex() before constructing)
 * Mirrors ext/cardano/value/Asset { policy_id: PolicyId, name: AssetName }
 */
export type OracleAsset = { policyId: string; assetName: string };

/** Immutable on-chain OracleConfiguration (validator parameter). */
export type OracleConfiguration = {
  platformAuthNft: string;        // PolicyId hex (28 bytes)
  pausePeriodLength: number;      // PosixTimeDiff (ms)
  rewardDismissingPeriodLength: number;
  feeToken?: OracleAsset;         // undefined → None (ADA fees)
};

/** Mutable OracleSettingsDatum stored at CoreSettings UTxO. */
export type OracleSettingsDatum = {
  nodes: string[];                        // sorted ascending FeedVkh hex list
  requiredNodeSignaturesCount: number;    // 1..nodes.length
  feeInfo: {
    rateNft: OracleAsset | null;          // None → ADA-based rate
    rewardPrices: { nodeFee: number; platformFee: number };
  };
  aggregationLivenessPeriod: number;      // > timeUncertaintyPlatform
  timeUncertaintyAggregation: number;     // > 0 and < timeUncertaintyPlatform
  timeUncertaintyPlatform: number;        // < aggregationLivenessPeriod
  iqrFenceMultiplier: number;             // > 100
  medianDivergencyFactor: number;         // >= 1
  utxoSizeSafetyBuffer: number;           // > 0 lovelace
  pausePeriodStartedAt: number | null;    // null on bootstrap
};

/** RewardAccountDatum stored at RewardAccount UTxO. */
export type RewardAccountDatum = {
  nodesToRewards: [string, number][];     // sorted ascending by FeedVkh
  lastUpdateTime: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Serialises ext/cardano/value/Asset.
 * plutus.json: Constr(0, [policy_id: bytes, name: bytes])
 */
const toAsset = (asset: OracleAsset) =>
  conStr0([byteString(asset.policyId), byteString(asset.assetName)]);

/**
 * Serialises Option<ext/cardano/value/Asset>.
 * plutus.json: Some = Constr(0, [Asset])  |  None = Constr(1, [])
 * NOTE: `none` is NOT exported by @meshsdk/core — we use conStr1([]).
 */
const toAssetOption = (asset: OracleAsset | null | undefined) =>
  asset ? conStr0([toAsset(asset)]) : conStr1([]);

// ---------------------------------------------------------------------------
// Datum Builders
// OracleDatum: AggState=0, OracleSettings=1, RewardAccount=2
// ---------------------------------------------------------------------------

/**
 * OracleConfiguration → Constr(0, [bytes, Int, Int, Option<Asset>])
 * Used as the validator parameter for both oracle_manager and oracle_nfts.
 */
export const toOracleConfigData = (conf: OracleConfiguration) =>
  conStr0([
    byteString(conf.platformAuthNft),
    integer(conf.pausePeriodLength),
    integer(conf.rewardDismissingPeriodLength),
    toAssetOption(conf.feeToken),
  ]);

/**
 * AggState(GenericData { price_map: [] }) — bootstrap datum.
 * AggState = Constr(0, [PriceData])
 * GenericData = PriceData alt 2 → Constr(2, [price_map])
 * price_map is a Plutus map → list([])
 */
export const toEmptyAggStateDatum = () =>
  conStr0([conStr2([list([])])]);

/**
 * AggState with live price data.
 * price_map key→value pairs sorted ascending by key:
 *   0 → price, 1 → timeCreation, 2 → timeExpiration
 */
export const toAggStateDatum = (
  price: number,
  timeCreation: number,
  timeExpiration: number
) =>
  conStr0([
    conStr2([
      list([
        list([integer(0), integer(price)]),
        list([integer(1), integer(timeCreation)]),
        list([integer(2), integer(timeExpiration)]),
      ]),
    ]),
  ]);

/**
 * OracleSettings(OracleSettingsDatum) = Constr(1, [OracleSettingsDatum])
 * OracleSettingsDatum = Constr(0, [nodes, reqSigs, FeeConfig, ...timings..., Option<PosixTime>])
 * FeeConfig = Constr(0, [Option<Asset>, RewardPrices])
 * RewardPrices = Constr(0, [Int, Int])
 * nodes list MUST be sorted ascending by FeedVkh.
 */
export const toSettingsDatum = (s: OracleSettingsDatum) =>
  conStr1([
    conStr0([
      list(s.nodes.map(byteString)),
      integer(s.requiredNodeSignaturesCount),
      // FeeConfig = Constr(0, [rate_nft: Option<Asset>, reward_prices: RewardPrices])
      conStr0([
        toAssetOption(s.feeInfo.rateNft),
        // RewardPrices = Constr(0, [node_fee: Int, platform_fee: Int])
        conStr0([
          integer(s.feeInfo.rewardPrices.nodeFee),
          integer(s.feeInfo.rewardPrices.platformFee),
        ]),
      ]),
      integer(s.aggregationLivenessPeriod),
      integer(s.timeUncertaintyAggregation),
      integer(s.timeUncertaintyPlatform),
      integer(s.iqrFenceMultiplier),
      integer(s.medianDivergencyFactor),
      integer(s.utxoSizeSafetyBuffer),
      // Option<PosixTime>: Some = Constr(0, [Int]), None = Constr(1, [])
      s.pausePeriodStartedAt === null
        ? conStr1([])
        : conStr0([integer(s.pausePeriodStartedAt)]),
    ]),
  ]);

/**
 * RewardAccount(RewardAccountDatum) = Constr(2, [RewardAccountDatum])
 * RewardAccountDatum = Constr(0, [nodes_to_rewards: Pairs<FeedVkh,Int>, last_update_time: Int])
 * nodesToRewards MUST be sorted ascending by FeedVkh (required by aiken's dict.from_ascending_pairs).
 */
export const toRewardAccountDatum = (
  nodesToRewards: [string, number][],
  lastUpdateTime: number
) => {
  const sorted = [...nodesToRewards].sort((a, b) => a[0].localeCompare(b[0]));
  return conStr2([
    conStr0([
      list(sorted.map(([vkh, amt]) => list([byteString(vkh), integer(amt)]))),
      integer(lastUpdateTime),
    ]),
  ]);
};

// ---------------------------------------------------------------------------
// Redeemer Builders
// ---------------------------------------------------------------------------

/**
 * MintingRedeemer:
 *   MintToken  = Constr(0, [])
 *   ScaleToken = Constr(1, [])
 *   BurnToken  = Constr(2, [])
 */
export const MintRedeemer = {
  MintToken:  () => mConStr0([]),
  ScaleToken: () => mConStr1([]),
  BurnToken:  () => mConStr2([]),
};

/**
 * OracleRedeemer:
 *   OdvAggregate(AggregateMessage)    = Constr(0, [map])  — on RewardAccount UTxO
 *   OdvAggregateMsg                   = Constr(1, [])     — on AggState UTxO (dual-spend marker)
 *   RedeemRewards{collector, out_ix}  = Constr(2, [RewardRedeemer, Int])
 *   ManageSettings(SettingsRedeemer)  = Constr(3, [SettingsRedeemer])
 *   ScaleDown                         = Constr(4, [])
 *   DismissRewards                    = Constr(5, [])
 */
export const OracleRedeemer = {
  /**
   * OdvAggregate — spent on the RewardAccount UTxO.
   * AggregateMessage = Pairs<FeedVkh, NodeFeed> sorted ascending by NodeFeed value (Int).
   * plutus.json: dataType "map" → serialised as a list of 2-element lists.
   */
  OdvAggregate: (nodeFeeds: Map<string, number>) => {
    const sorted = Array.from(nodeFeeds.entries()).sort((a, b) => a[1] - b[1]);
    return conStr0([
      list(sorted.map(([vkh, feed]) => list([byteString(vkh), integer(feed)]))),
    ]);
  },

  /** OdvAggregateMsg — spent on the AggState UTxO (dual-spend marker). */
  OdvAggregateMsg: () => conStr1([]),

  /**
   * RedeemRewards = Constr(2, [RewardRedeemer, Int])
   * RewardRedeemer: NodeCollect = Constr(0, []), PlatformCollect = Constr(1, [])
   * @param isPlatform  true = PlatformCollect, false = NodeCollect
   * @param outIdx      0-based index of the RewardAccount output in this tx
   */
  RedeemRewards: (isPlatform: boolean, outIdx: number) =>
    conStr2([
      isPlatform ? conStr1([]) : conStr0([]),
      integer(outIdx),
    ]),

  /**
   * ManageSettings = Constr(3, [SettingsRedeemer])
   * SettingsRedeemer index: see SettingsAction constants below.
   */
  ManageSettings: (action: number) => conStr(3, [conStr(action, [])]),

  ScaleDown:      () => conStr(4, []),
  DismissRewards: () => conStr(5, []),
};

/**
 * SettingsRedeemer indices (plutus.json SettingsRedeemer):
 *   UpdateSettings=0, AddNodes=1, DelNodes=2, PauseOracle=3, ResumeOracle=4, RemoveOracle=5
 */
export const SettingsAction = {
  UpdateSettings: 0,
  AddNodes:       1,
  DelNodes:       2,
  PauseOracle:    3,
  ResumeOracle:   4,
  RemoveOracle:   5,
} as const;
