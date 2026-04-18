import { describe, it, expect } from "vitest";
import { OracleScripts } from "../../src/scripts";
import { NativeScriptBuilder } from "../../src/utils/NativeScriptBuilder";
import { OracleConfiguration } from "../../src/types";

const conf: OracleConfiguration = {
  platformAuthNft: "00000000000000000000000000000000000000000000000000000000",
  pausePeriodLength: 86400000,
  rewardDismissingPeriodLength: 604800000,
};

describe("OracleScripts", () => {
  describe("oracleManager()", () => {
    it("returns a valid script, 56-char hash, and testnet address", async () => {
      const scripts = new OracleScripts(0);
      const { script, hash, address } = await scripts.oracleManager(conf);

      expect(script.code).toBeDefined();
      expect(script.version).toBe("V3");
      expect(hash).toHaveLength(56);
      expect(address).toMatch(/^addr_test/);
    });
  });

  describe("oracleNfts()", () => {
    it("returns a valid script and 56-char policyId", async () => {
      const scripts = new OracleScripts(0);
      const { hash: managerHash } = await scripts.oracleManager(conf);

      const utxoRef = {
        txHash: "aac000000000000000000000000000000000000000000000000000000000000a",
        outputIndex: 0,
      };
      const { script, policyId } = await scripts.oracleNfts(utxoRef, conf, managerHash);

      expect(script.code).toBeDefined();
      expect(script.version).toBe("V3");
      expect(policyId).toHaveLength(56);
    });
  });
});

describe("NativeScriptBuilder", () => {
  // 56-char hex strings (28 bytes) representing valid Payment Key Hashes
  const signers = [
    "a".repeat(56),
    "b".repeat(56),
    "c".repeat(56),
  ];

  describe("buildMultisig()", () => {
    it("builds a 2-of-3 multisig with correct structure and testnet address", () => {
      const { nativeScript, scriptAddress } = NativeScriptBuilder.buildMultisig(signers, 2, 0);

      expect(nativeScript.type).toBe("atLeast");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((nativeScript as any).required).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((nativeScript as any).scripts).toHaveLength(3);
      expect(scriptAddress).toMatch(/^addr_test/);
    });

    it("throws when threshold exceeds signer count", () => {
      expect(() => NativeScriptBuilder.buildMultisig(signers, 4, 0)).toThrow(
        "Threshold cannot be greater than the number of signers."
      );
    });
  });
});
