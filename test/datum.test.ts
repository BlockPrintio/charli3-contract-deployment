import { describe, it, expect } from "vitest";
import {
  toSettingsDatum,
  toRewardAccountDatum,
  toAggStateDatum,
  OracleSettingsDatum,
} from "../src/types";

describe("Datum Serialization", () => {
  it("should automatically sort nodes in OracleSettingsDatum", () => {
    const settings: OracleSettingsDatum = {
      nodes: ["cccc", "aaaa", "bbbb"],
      requiredNodeSignaturesCount: 1,
      feeInfo: {
        rateNft: null,
        rewardPrices: { nodeFee: 1000, platformFee: 500 },
      },
      aggregationLivenessPeriod: 100,
      timeUncertaintyAggregation: 10,
      timeUncertaintyPlatform: 20,
      iqrFenceMultiplier: 150,
      medianDivergencyFactor: 25,
      utxoSizeSafetyBuffer: 2000000,
      pausePeriodStartedAt: null,
    };

    const datum = toSettingsDatum(settings);
    // The nodes list should be sorted alphabetically: aaaa, bbbb, cccc
    const nodeFields = (datum as any).fields[0].fields[0].list;
    expect(nodeFields[0].bytes).toBe("aaaa");
    expect(nodeFields[1].bytes).toBe("bbbb");
    expect(nodeFields[2].bytes).toBe("cccc");
  });

  it("should sort RewardAccount mapping by FeedVkh", () => {
    const rewards: [string, number][] = [
      ["ffff", 100],
      ["aaaa", 200],
      ["dddd", 150],
    ];
    const datum = toRewardAccountDatum(rewards, 12345);
    const rewardList = (datum as any).fields[0].fields[0].list;
    
    // Should be: aaaa, dddd, ffff
    expect(rewardList[0].list[0].bytes).toBe("aaaa");
    expect(rewardList[1].list[0].bytes).toBe("dddd");
    expect(rewardList[2].list[0].bytes).toBe("ffff");
  });

  it("should construct AggState datum correctly", () => {
    const datum = toAggStateDatum(123, 1000, 2000);
    const map = (datum as any).fields[0].fields[0].list;
    
    // Pair(0, 123)
    expect(map[0].list[0].int).toBe(0);
    expect(map[0].list[1].int).toBe(123);
    
    // Pair(1, 1000)
    expect(map[1].list[1].int).toBe(1000);
    
    // Pair(2, 2000)
    expect(map[2].list[1].int).toBe(2000);
  });
});
