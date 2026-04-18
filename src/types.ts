/**
 * types.ts — Plutus data serialisation for the Charli3 Pull Oracle
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

const toAsset = (asset: OracleAsset) =>
  conStr0([byteString(asset.policyId), byteString(asset.assetName)]);

const toAssetOption = (asset: OracleAsset | null | undefined) =>
  asset ? conStr0([toAsset(asset)]) : conStr1([]);

// ---------------------------------------------------------------------------
// Datum Builders
// ---------------------------------------------------------------------------

/**
 * OracleConfiguration → Constr(0, [bytes, Int, Int, Option<Asset>])
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
 */
export const toEmptyAggStateDatum = () =>
  conStr0([conStr2([list([])])]);

/**
 * AggState with live price data.
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
 * nodes list MUST be sorted ascending by FeedVkh.
 */
export const toSettingsDatum = (s: OracleSettingsDatum) => {
  const sortedNodes = [...s.nodes].sort((a, b) => a.localeCompare(b));
  return conStr1([
    conStr0([
      list(sortedNodes.map(byteString)),
      integer(s.requiredNodeSignaturesCount),
      conStr0([
        toAssetOption(s.feeInfo.rateNft),
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
      s.pausePeriodStartedAt === null
        ? conStr1([])
        : conStr0([integer(s.pausePeriodStartedAt)]),
    ]),
  ]);
};

/**
 * RewardAccount(RewardAccountDatum) = Constr(2, [RewardAccountDatum])
 * nodesToRewards MUST be sorted ascending by FeedVkh.
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

export const MintRedeemer = {
  MintToken:  () => mConStr0([]),
  ScaleToken: () => mConStr1([]),
  BurnToken:  () => mConStr2([]),
};

export const OracleRedeemer = {
  /**
   * OdvAggregate — spent on the RewardAccount UTxO.
   * AggregateMessage = Pairs<FeedVkh, NodeFeed> sorted ascending by NodeFeed value (Int).
   */
  OdvAggregate: (nodeFeeds: Map<string, number>) => {
    // Sort primarily by NodeFeed value (Int), secondarily by FeedVkh (bytes/hex)
    const sorted = Array.from(nodeFeeds.entries()).sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0].localeCompare(b[0]);
    });
    return conStr0([
      list(sorted.map(([vkh, feed]) => list([byteString(vkh), integer(feed)]))),
    ]);
  },

  /** OdvAggregateMsg — spent on the AggState UTxO (dual-spend marker). */
  OdvAggregateMsg: () => conStr1([]),

  /**
   * RedeemRewards = Constr(2, [RewardRedeemer, Int])
   */
  RedeemRewards: (isPlatform: boolean, outIdx: number) =>
    conStr2([
      isPlatform ? conStr1([]) : conStr0([]),
      integer(outIdx),
    ]),

  /**
   * ManageSettings = Constr(3, [SettingsRedeemer])
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
