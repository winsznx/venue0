import { parseAbi } from "viem";

/** Interface observed on the live Stock Token implementation behind the beacon proxy (2026-09-17). */
export const stockTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function uid() view returns (bytes32)",
  "function uiMultiplier() view returns (uint256)",
  "function newUIMultiplier() view returns (uint256)",
  "function effectiveAt() view returns (uint256)",
  "function balanceOfUI(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function tokenPaused() view returns (bool)",
  "function oraclePaused() view returns (bool)",
  "function ACCESS_CONTROLLED_REGISTRY() view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export const accessControlledRegistryAbi = parseAbi([
  "function isBlocked(address account) view returns (bool)",
  "function paused() view returns (bool)",
]);

export const chainlinkAggregatorAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);
