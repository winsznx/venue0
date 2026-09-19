// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Venue0Settlement
/// @notice Atomically executes a multi-party settlement plan that every participant signed.
/// Tokens move wallet to wallet through `transferFrom`; this contract never holds user tokens.
/// It does not match, price, or custody. Matching happens offchain before a plan exists.
/// @dev Authorization: every address in `plan.participants` must sign an EIP-712 `PlanApproval` over the exact plan
/// (every leg, amount, round, snapshot hash and validity window) with a nonce of its choice. Any change to the plan
/// changes its hash and invalidates every signature. Anyone may submit a fully approved plan.
/// Replay: each plan hash settles at most once (`planSettled`), and each (owner, nonce) is consumed once
/// (`nonceUsed`); a participant can withdraw an unused approval with `cancelNonce`.
/// Atomicity: all legs move in one call or the call reverts; a paused or blocklisted Stock Token, a missing
/// allowance or an insufficient balance on any leg reverts the whole plan.
/// Not in scope: price checks (plans carry the valuation snapshot hash but the contract does not read oracles),
/// residual execution, and any retention of tokens or fees.
contract Venue0Settlement is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Leg {
        address token;
        address from;
        address to;
        uint256 amount;
    }

    struct SettlementPlan {
        bytes32 roundId;
        bytes32 planId;
        bytes32 valuationSnapshotHash;
        uint64 validAfter;
        uint64 validUntil;
        address[] participants;
        Leg[] legs;
    }

    struct Approval {
        uint256 nonce;
        bytes signature;
    }

    bytes32 public constant LEG_TYPEHASH = keccak256("Leg(address token,address from,address to,uint256 amount)");

    bytes32 public constant SETTLEMENT_PLAN_TYPEHASH = keccak256(
        "SettlementPlan(bytes32 roundId,bytes32 planId,bytes32 valuationSnapshotHash,uint64 validAfter,uint64 validUntil,address[] participants,Leg[] legs)Leg(address token,address from,address to,uint256 amount)"
    );

    bytes32 public constant PLAN_APPROVAL_TYPEHASH = keccak256(
        "PlanApproval(address participant,uint256 nonce,SettlementPlan plan)Leg(address token,address from,address to,uint256 amount)SettlementPlan(bytes32 roundId,bytes32 planId,bytes32 valuationSnapshotHash,uint64 validAfter,uint64 validUntil,address[] participants,Leg[] legs)"
    );

    /// @notice planStructHash => settled.
    mapping(bytes32 => bool) public planSettled;

    /// @notice owner => nonce => consumed or cancelled. Unordered so one wallet can join concurrent rounds.
    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    /// @notice Emitted once per settled plan.
    event PlanSettled(
        bytes32 indexed roundId,
        bytes32 indexed planId,
        bytes32 indexed planHash,
        uint256 participantCount,
        uint256 legCount
    );

    /// @notice Emitted for every leg, in the plan's canonical (token, from, to) order.
    event CrossingLeg(bytes32 indexed planHash, address indexed token, address indexed from, address to, uint256 amount);

    /// @notice Emitted for every participant whose approval was used by a settlement.
    event NonceConsumed(address indexed owner, uint256 indexed nonce, bytes32 indexed planHash);

    /// @notice Emitted when a participant withdraws an unused approval.
    event NonceCancelled(address indexed owner, uint256 indexed nonce);

    error PlanNotYetValid(uint64 validAfter);
    error PlanExpired(uint64 validUntil);
    error PlanAlreadySettled(bytes32 planHash);
    error TooFewParticipants();
    error EmptyPlan();
    error ParticipantsNotSorted(uint256 index);
    error ApprovalCountMismatch(uint256 participants, uint256 approvals);
    error NonceAlreadyUsed(address owner, uint256 nonce);
    error InvalidSignature(address participant);
    error ZeroAmount(uint256 legIndex);
    error ZeroToken(uint256 legIndex);
    error SelfTransfer(uint256 legIndex);
    error LegsNotSorted(uint256 legIndex);
    error UnknownParty(uint256 legIndex, address party);
    error IdleParticipant(address participant);

    constructor() EIP712("VENUE0", "1") {}

    /// @notice Settles every leg of `plan` in one transaction or reverts entirely.
    /// @param approvals One approval per participant, in the same order as `plan.participants`.
    function settle(SettlementPlan calldata plan, Approval[] calldata approvals) external nonReentrant returns (bytes32 planHash) {
        if (block.timestamp < plan.validAfter) revert PlanNotYetValid(plan.validAfter);
        if (block.timestamp > plan.validUntil) revert PlanExpired(plan.validUntil);

        uint256 participantCount = plan.participants.length;
        if (participantCount < 2) revert TooFewParticipants();
        if (plan.legs.length == 0) revert EmptyPlan();
        if (approvals.length != participantCount) revert ApprovalCountMismatch(participantCount, approvals.length);

        for (uint256 i = 1; i < participantCount; ++i) {
            if (plan.participants[i - 1] >= plan.participants[i]) revert ParticipantsNotSorted(i);
        }

        _validateLegs(plan);

        planHash = hashPlan(plan);
        if (planSettled[planHash]) revert PlanAlreadySettled(planHash);
        planSettled[planHash] = true;

        for (uint256 i = 0; i < participantCount; ++i) {
            address participant = plan.participants[i];
            uint256 nonce = approvals[i].nonce;
            if (nonceUsed[participant][nonce]) revert NonceAlreadyUsed(participant, nonce);
            bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(PLAN_APPROVAL_TYPEHASH, participant, nonce, planHash)));
            if (!_isValidApproval(participant, digest, approvals[i].signature)) revert InvalidSignature(participant);
            nonceUsed[participant][nonce] = true;
            emit NonceConsumed(participant, nonce, planHash);
        }

        uint256 legCount = plan.legs.length;
        for (uint256 i = 0; i < legCount; ++i) {
            Leg calldata leg = plan.legs[i];
            IERC20(leg.token).safeTransferFrom(leg.from, leg.to, leg.amount);
            emit CrossingLeg(planHash, leg.token, leg.from, leg.to, leg.amount);
        }

        emit PlanSettled(plan.roundId, plan.planId, planHash, participantCount, legCount);
    }

    /// @notice Lets a wallet withdraw a signed approval before settlement.
    function cancelNonce(uint256 nonce) external {
        if (nonceUsed[msg.sender][nonce]) revert NonceAlreadyUsed(msg.sender, nonce);
        nonceUsed[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    /// @notice EIP-712 struct hash of a plan. Offchain signers must produce the same value.
    function hashPlan(SettlementPlan calldata plan) public pure returns (bytes32) {
        uint256 legCount = plan.legs.length;
        bytes32[] memory legHashes = new bytes32[](legCount);
        for (uint256 i = 0; i < legCount; ++i) {
            Leg calldata leg = plan.legs[i];
            legHashes[i] = keccak256(abi.encode(LEG_TYPEHASH, leg.token, leg.from, leg.to, leg.amount));
        }
        return keccak256(
            abi.encode(
                SETTLEMENT_PLAN_TYPEHASH,
                plan.roundId,
                plan.planId,
                plan.valuationSnapshotHash,
                plan.validAfter,
                plan.validUntil,
                keccak256(abi.encodePacked(plan.participants)),
                keccak256(abi.encodePacked(legHashes))
            )
        );
    }

    /// @notice Full EIP-712 digest a participant signs for `plan` with `nonce`.
    function approvalDigest(SettlementPlan calldata plan, address participant, uint256 nonce) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PLAN_APPROVAL_TYPEHASH, participant, nonce, hashPlan(plan))));
    }

    /// @notice EIP-712 domain separator (name "VENUE0", version "1", this chain, this contract).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @dev ECDSA from the participant's own key is accepted even when the address has code. EIP-7702 delegated EOAs
    /// carry delegation code, and OpenZeppelin's SignatureChecker would otherwise route them to ERC-1271 only.
    /// Contract accounts without a key fall back to ERC-1271.
    function _isValidApproval(address participant, bytes32 digest, bytes calldata signature) private view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == participant) return true;
        return participant.code.length > 0 && SignatureChecker.isValidERC1271SignatureNowCalldata(participant, digest, signature);
    }

    /// @dev Legs must be strictly ascending by (token, from, to), which rejects duplicates and makes plan hashes canonical.
    /// Every leg party must be a participant and every participant must appear in at least one leg.
    function _validateLegs(SettlementPlan calldata plan) private pure {
        uint256 participantCount = plan.participants.length;
        bool[] memory active = new bool[](participantCount);
        uint256 legCount = plan.legs.length;

        for (uint256 i = 0; i < legCount; ++i) {
            Leg calldata leg = plan.legs[i];
            if (leg.amount == 0) revert ZeroAmount(i);
            if (leg.token == address(0)) revert ZeroToken(i);
            if (leg.from == leg.to) revert SelfTransfer(i);
            if (i > 0 && !_legLessThan(plan.legs[i - 1], leg)) revert LegsNotSorted(i);

            active[_participantIndex(plan.participants, leg.from, i)] = true;
            active[_participantIndex(plan.participants, leg.to, i)] = true;
        }

        for (uint256 i = 0; i < participantCount; ++i) {
            if (!active[i]) revert IdleParticipant(plan.participants[i]);
        }
    }

    function _legLessThan(Leg calldata a, Leg calldata b) private pure returns (bool) {
        if (a.token != b.token) return a.token < b.token;
        if (a.from != b.from) return a.from < b.from;
        return a.to < b.to;
    }

    /// @dev Binary search over the sorted participant list.
    function _participantIndex(address[] calldata participants, address party, uint256 legIndex) private pure returns (uint256) {
        uint256 low = 0;
        uint256 high = participants.length;
        while (low < high) {
            uint256 mid = (low + high) >> 1;
            address candidate = participants[mid];
            if (candidate == party) return mid;
            if (candidate < party) low = mid + 1;
            else high = mid;
        }
        revert UnknownParty(legIndex, party);
    }
}
