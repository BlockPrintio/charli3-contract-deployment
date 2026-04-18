# Contributing to charli3-contract-deployment

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| Node.js | 18 or higher |
| npm | 9 or higher (bundled with Node 18) |
| Blockfrost API key | Preprod network — obtain at [blockfrost.io](https://blockfrost.io) |
| Funded Preprod wallet | Needs ~200 ADA for reference script deposits + collateral |

## Environment Setup

Copy the example env file and fill in your credentials:

```sh
cp .env.example .env
```

`.env` format:

```
BLOCKFROST_API_KEY=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
WALLET_MNEMONIC=word1 word2 word3 ... word24
```

> The `.env` file is listed in `.gitignore` — never commit credentials.

## Running Tests

### Unit tests (no network required)

```sh
npm test
# or explicitly:
npm run test:unit
```

Unit tests cover datum serialization, script parameterization, and native script
construction. They run offline against compiled Plutus blueprints only.

### Integration tests (Preprod network required)

```sh
npm run test:integration
```

Integration tests execute the full two-step deployment workflow against Cardano
Preprod:

1. `deployScripts()` — submits two transactions that store reference scripts on-chain
2. `bootstrap()` — mints protocol tokens and initializes oracle state

**Important:** The `bootstrap()` step requires the NFTs reference script transaction
from step 1 to be confirmed on-chain before submitting. Allow ~60 seconds between
the two steps in a live run. The test file includes a 3-minute timeout to account
for network latency.

You need at least 3 UTxOs in the wallet: one reserved as the bootstrap UTxO,
one holding the platform auth NFT, and at least one for fees and deposits.

## Project Structure

```
src/                   Library source
  CharlieContract.ts   Main class
  scripts.ts           OracleScripts — parameterized Plutus validators
  types.ts             Datum / redeemer builders and protocol types
  utils/
    NativeScriptBuilder.ts  M-of-N governance scripts
  transactions/
    deployScripts.ts   Step 1: deploy reference UTxOs
    bootstrap.ts       Step 2: initialize oracle state
test/
  unit/                Offline unit tests (safe to run in CI)
  integration/         Live Preprod tests (requires .env)
```

## PR Conventions

### Branch naming

```
feat/<short-description>      New feature
fix/<short-description>       Bug fix
test/<short-description>      Tests only
docs/<short-description>      Documentation only
refactor/<short-description>  Code cleanup with no behavior change
```

### Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add aggregate transaction builder
fix: handle missing collateral UTxO gracefully
test: add unit tests for NativeScriptBuilder edge cases
docs: document bootstrap confirmation requirement
```

### PR checklist

- [ ] `npm test` passes (all unit tests green)
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`
- [ ] No new `any` types without a comment explaining why
- [ ] Integration test path covered or documented if untestable offline
- [ ] CONTRIBUTING.md updated if setup steps changed
