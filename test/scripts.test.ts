import { describe, it, expect } from "vitest";
import { OracleScripts } from "../src/scripts";
import { OracleConfiguration } from "../src/types";

describe("Script Parameterization", () => {
  const conf: OracleConfiguration = {
    platformAuthNft: "00000000000000000000000000000000000000000000000000000000",
    pausePeriodLength: 86400000,
    rewardDismissingPeriodLength: 604800000,
  };

  it("should parameterize oracle_manager script", async () => {
    const scripts = new OracleScripts(0);
    const { script, hash, address } = await scripts.oracleManager(conf);
    
    expect(script.code).toBeDefined();
    expect(script.version).toBe("V3");
    expect(hash).toHaveLength(56);
    expect(address.startsWith("addr_test")).toBe(true);
  });

  it("should parameterize oracle_nfts script", async () => {
    const scripts = new OracleScripts(0);
    const utxoRef = { txHash: "aac000000000000000000000000000000000000000000000000000000000000a", outputIndex: 0 };
    const { script, policyId } = await scripts.oracleNfts(utxoRef, conf, "5820" + "0".repeat(52)); // mock hash
    
    expect(script.code).toBeDefined();
    expect(policyId).toHaveLength(56);
  });
});
