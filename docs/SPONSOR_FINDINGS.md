# Sponsor and Integration Findings

Observed facts and friction from current official docs and live calls. Doc facts cite the page; live facts cite the artifact. Checked 2026-09-17 unless dated otherwise.

## Robinhood Chain / Stock Tokens

Live observations:

- `GET https://api.robinhood.com/rhj/assets` works without auth. Envelope `{ "assets": [...] }`. Live records include `tokenDecimals`, `isin`, and `deployments[].networkName`, which the API reference page does not list.
- `tradingCapabilities` conflict: the Stock Token APIs page documents `{ fractionalTradability, allDayTradability, extendedHoursFractionalTradability }`, the Stock Tokens page documents `{ market|extended|overnight: { whole, fractional } }`. The live API returns the second shape for all 194 assets. Venue0 parses both and treats anything unrecognized as not tradable (`packages/assets/src/trading-capabilities.ts`).
- `GET /rhj/prices/{symbol}` returns `{ quotes: [...] }` with raw underlying bid/ask (not multiplier-adjusted), `isTradingHalt`, `generatedAt`, plus undocumented `dailyHigh`, `dailyLow`, `mintBurnTokenVolume`, `mintBurnUsdVolume`. A `?symbols=` batch query is rejected (`Could not find field "symbols"`).
- The public RPC is load-balanced; reads pinned to the just-returned head block can fail with `unsupported block number` (D-004).
- Stock Token contracts are beacon proxies with pause, oracle pause, `adminBurn`, registry blocklist and undocumented ERC-2612 permit (D-005).
- Chainlink covers 35 of 194 Stock Tokens. Feed `description()` naming is inconsistent (`RHNVDA / USD` vs `Robinhood AAPL / USD`) and feeds carry no token address, so feed-to-token binding relies on the directory name plus a price cross-check (D-003).
- Robinhood's contracts page renders its table client-side, so the canonical list is only machine-readable through `/rhj/assets`. USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` appears statically on the contracts page but not in `/rhj/assets`.
- Testnet (46630) Stock Tokens and a testnet faucet are not documented.
- The public RPC serves historical state only for recent blocks: `eth_call` 100 blocks back worked, 10,000 blocks back returned `historical state ... is not available`. Independent before/after verification needs prompt execution or an archive provider.
- Anvil's well-known dev addresses (`0xf39F...2266`, `0x7099...79C8`, `0x3C44...93BC`) carry EIP-7702 delegation code `0xef01008a5b10eb2faf57665f63709ec4b3943a3b005df6` on mainnet. Any integration test that reuses those keys against forked state hits smart-account signature paths.
- Live execution gas price observed 0.054 gwei (base fee 53,988,000 wei). `arbOSVersion()` = 116.

Docs facts (https://docs.robinhood.com/chain/):

- Chainlink feed price is multiplier-adjusted; underlying = feed x 1e18 / `uiMultiplier()` (oracles-and-price-feeds).
- `balanceOf` does not rebase; ERC-8056 `uiMultiplier`, `newUIMultiplier`, `effectiveAt`, `balanceOfUI` (building-with-stock-tokens).
- Sequencer excludes transactions involving sanctioned addresses; a blocked tx looks like it never happened (differences-from-ethereum).
- Brand: "Robinhood Chain" in full, "Stock Tokens" (not "tokenized stocks/equities"), no HOOD/$HOOD, metrics need source, period and method (brand-guidelines).
- Eligibility: not offered to U.S. persons; also restricted in Canada, UK, Switzerland; no VPN circumvention (stock-tokens, terms-of-service).
- Blockscout verification: `forge verify-contract ... --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/` (deploy-smart-contracts). Blockscout's v2 JSON API currently sits behind a Cloudflare challenge for scripted requests.

## Uniswap Trading API

Live (2026-09-18):

- `POST /permissions` for NVDA and AAPL on 4663: `isPermissioned: false`. So the router 2.2.0 / permissioned-pool conflict does not apply to these Stock Tokens.
- `/quote` returned CLASSIC routes for NVDA, AAPL, SPY into both ETH and USDG (v3 and v4 pools), and for NVDA -> AAPL directly (v4, 0.3% fee). Some Stock Token / USDG v4 routes list a fee string of `838.8608%` in `routeString`, which looks like a dynamic-fee hook sentinel rendered as a percentage; quoted outputs were still sane.
- Full residual swap succeeded: `/check_approval` -> Permit2 approve -> requote -> sign `permitData` -> `/swap` (with `simulateTransaction: true`) -> send. Received exactly the quoted amount.

Docs:

- Base `https://trade-api.gateway.uniswap.org/v1`, header `x-api-key`, free, 6 rps default. Keys via https://developers.uniswap.org/dashboard/welcome (error docs say self-serve; FAQ still says request access).
- Chain 4663 supported. Universal Router 2.1.1 at `0x8876789976decbfcbbbe364623c63652db8c0904`; header `x-universal-router-version: 2.1.1`; `2.0` errors on this chain. UniswapX V3 live (DutchV3OrderReactor `0x000000007A1C8e570011EeDF86A2A35593013cBA`).
- Conflict: the permissioned-pools page says permissioned tokens need router `2.2.0`, which is not in the OpenAPI enum and has no listed deployment. `POST /v1/permissions` reports `isPermissioned` / `isAllowlisted` per wallet and token. Whether Stock Tokens are permissioned is undocumented; this is the first live call to make once a key exists.
- No-route outcome is `404 NoRouteFoundError`; branch on `errorCode`, not `detail`.
- v3 factory on 4663 `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`, v4 PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951` (usable for independent pool existence checks without a key).

## Dynamic

Live (2026-09-18, Sandbox):

- `DynamicEvmWalletClient.authenticateApiToken` + `createWalletAccount({ TWO_OF_TWO, password, backUpToDynamic: true })` created a server wallet in about 3s.
- `getWalletClient({ walletMetadata, password, externalServerKeyShares, chain, rpcUrl })` with a viem `defineChain` for 4663 signed EIP-712 typed data and sent transactions on Robinhood Chain. Robinhood Chain did not need to be enabled in the dashboard.
- Installing `@dynamic-labs-wallet/node-evm@1.1.12` under pnpm 11 needs `protobufjs` allowed to run its build script.

Docs:

- Packages: `@dynamic-labs-wallet/node-evm` 1.1.12 and `@dynamic-labs-wallet/node` 1.1.12 (native addons; Node 18+ on Linux x64/arm64 or macOS arm64; not edge runtimes).
- Server wallets and agent wallets are fully backend. Delegated access requires the end user to approve in a client SDK, so it cannot be exercised before a frontend exists.
- Delegated access is Enterprise-only in production but testable in Sandbox (1,000-user cap).
- Docs vs types drift: `getWalletClient` docs show `accountAddress`; 1.1.12 types require `walletMetadata`. `delegatedSignTypedData` exists in types but not docs. Webhook signature header is `x-dynamic-signature-256` on one page and `x-dynamic-signature` on another.
- Robinhood Chain 4663 is on Dynamic's EVM gas sponsorship relayer list (enterprise only).

## Definitive Flash

Live (2026-09-18):

- `GET /search?query=NVDA&chain=robinhood` returns the canonical NVDA Stock Token (`0xd0601C...9EEC`) with liquidity and holder counts, plus lookalikes such as `NVDAx3L` (NVDA 3x Long) at other addresses. Integrators must filter by canonical address.
- Quotes for market, limit and TWAP worked for NVDA -> USDG and NVDA -> AAPL. Fees are close to flat per order: about $0.16 for market/limit and $0.33 for a 2-bucket TWAP regardless of $0.44 or $11 size.
- Default quotes return an unlimited `approveTx` (`0xff...ff`). `forceMinimalAllowance: true` gives an exact approval; Venue0 always sets it.
- The signed `FlashOrder` (domain `DefinitiveFlashAllowance` v1, verifyingContract `0x5d00000873b6BF41539e6f5365B0Ff7d3c368f78`) binds swapper, vault `0x8Ed0652B815643d096BC18032567F8FfcC72Ea67`, recipient, tokens, amount, salt and deadline. `chainId` arrives as a string and uint fields as strings; viem signing needs them converted.
- A limit sell of 0.00547 NVDA for AAPL filled in about 1 second via Uniswap V4. The limit was enforced on the post-fee traded amount; the fee ($0.162 network + $0.0012 trade) came out of the input, so the all-in rate was 13% under the limit on a $1.20 order. Integration: PASS. Economic suitability at that size: NO. The run is kept as a boundary case; the fee must be re-queried before the demo order, and observed fee levels are not treated as universal provider facts.

Docs:

- Docs live at `https://flash.definitive.fi/docs` (the PRD's `ddp.definitive.fi` redirects to marketing). OpenAPI at `https://flash.definitive.fi/v1/openapi.json`.
- Base `https://flash.definitive.fi/v1`, single header `x-definitive-api-key`, no secret. Self-serve key at app.definitive.fi -> More -> Flash. No sandbox; test on production with small size.
- Non-custodial: funder wallet approves the Flash settlement (or Permit2) and signs `evm.orderTypedData`. The signature binds token, amount, recipient, deadline, not a minimum output; limit/TWAP protection is enforced offchain by Flash.
- Order types in the API enum: `market, limit, twap, stop, stop-loss, take-profit, bracket`. No `dca` in the enum despite marketing copy.
- TWAP: `durationSeconds` >= 300 on quote, `twapBucketCount` 2..2560 and `startTime` identical on quote and order.
- Chain enum includes `robinhood`. No per-token Stock Token coverage list; must be confirmed with `GET /search?chain=robinhood` and a live quote.
- Orders can be cancelled by Flash when gas plus fees exceed 30% of order value (`REASON_EXECUTION_COST_EXCEEDS_LIMIT`), which sets a practical minimum residual size.
- Fee: 10 bps base plus optional integrator fee.
