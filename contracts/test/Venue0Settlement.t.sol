// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Venue0Settlement} from "../src/Venue0Settlement.sol";

contract MockStockToken is ERC20 {
    constructor(string memory symbol_) ERC20(symbol_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mimics an issuer pause: every transfer reverts.
contract PausedToken is MockStockToken {
    constructor() MockStockToken("PAUSED") {}

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("token paused");
    }
}

/// @dev Non-reverting ERC-20 that signals failure by returning false.
contract FalseReturningToken is MockStockToken {
    constructor() MockStockToken("FALSE") {}

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @dev Minimal ERC-1271 smart account controlled by an owner key.
contract SmartAccount {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function approveToken(address token, address spender, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        ERC20(token).approve(spender, amount);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered,,) = ECDSA.tryRecover(hash, signature);
        return recovered == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract Venue0SettlementTest is Test {
    Venue0Settlement internal settlement;
    MockStockToken internal nvda;
    MockStockToken internal aapl;
    MockStockToken internal spy;

    uint256 internal constant UNIT = 1e18;

    struct Wallet {
        address addr;
        uint256 key;
    }

    Wallet[] internal wallets;

    function setUp() public {
        settlement = new Venue0Settlement();
        nvda = new MockStockToken("NVDA");
        aapl = new MockStockToken("AAPL");
        spy = new MockStockToken("SPY");
        vm.warp(1_800_000_000);

        for (uint256 i = 0; i < 4; ++i) {
            (address addr, uint256 key) = makeAddrAndKey(string.concat("wallet", vm.toString(i)));
            wallets.push(Wallet(addr, key));
        }
        _sortWallets();
    }

    // ---------------------------------------------------------------- helpers

    function _sortWallets() internal {
        for (uint256 i = 1; i < wallets.length; ++i) {
            for (uint256 j = i; j > 0 && wallets[j - 1].addr > wallets[j].addr; --j) {
                Wallet memory tmp = wallets[j - 1];
                wallets[j - 1] = wallets[j];
                wallets[j] = tmp;
            }
        }
    }

    function _fund(MockStockToken token, address owner, uint256 amount) internal {
        token.mint(owner, amount);
        vm.prank(owner);
        token.approve(address(settlement), amount);
    }

    function _basePlan(address[] memory participants, Venue0Settlement.Leg[] memory legs)
        internal
        view
        returns (Venue0Settlement.SettlementPlan memory plan)
    {
        plan.roundId = keccak256("round-1");
        plan.planId = keccak256("plan-1");
        plan.valuationSnapshotHash = keccak256("snapshot-1");
        plan.validAfter = uint64(block.timestamp - 60);
        plan.validUntil = uint64(block.timestamp + 600);
        plan.participants = participants;
        plan.legs = _sortLegs(legs);
    }

    function _sortLegs(Venue0Settlement.Leg[] memory legs) internal pure returns (Venue0Settlement.Leg[] memory) {
        for (uint256 i = 1; i < legs.length; ++i) {
            for (uint256 j = i; j > 0 && _legGreater(legs[j - 1], legs[j]); --j) {
                Venue0Settlement.Leg memory tmp = legs[j - 1];
                legs[j - 1] = legs[j];
                legs[j] = tmp;
            }
        }
        return legs;
    }

    function _legGreater(Venue0Settlement.Leg memory a, Venue0Settlement.Leg memory b) internal pure returns (bool) {
        if (a.token != b.token) return a.token > b.token;
        if (a.from != b.from) return a.from > b.from;
        return a.to > b.to;
    }

    function _keyOf(address addr) internal view returns (uint256) {
        for (uint256 i = 0; i < wallets.length; ++i) {
            if (wallets[i].addr == addr) return wallets[i].key;
        }
        revert("unknown wallet");
    }

    function _approvals(Venue0Settlement.SettlementPlan memory plan, uint256 nonceBase)
        internal
        view
        returns (Venue0Settlement.Approval[] memory approvals)
    {
        approvals = new Venue0Settlement.Approval[](plan.participants.length);
        for (uint256 i = 0; i < plan.participants.length; ++i) {
            address participant = plan.participants[i];
            uint256 nonce = nonceBase + i;
            bytes32 digest = settlement.approvalDigest(plan, participant, nonce);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(_keyOf(participant), digest);
            approvals[i] = Venue0Settlement.Approval(nonce, abi.encodePacked(r, s, v));
        }
    }

    function _pair() internal view returns (address[] memory p) {
        p = new address[](2);
        p[0] = wallets[0].addr;
        p[1] = wallets[1].addr;
    }

    function _trio() internal view returns (address[] memory p) {
        p = new address[](3);
        p[0] = wallets[0].addr;
        p[1] = wallets[1].addr;
        p[2] = wallets[2].addr;
    }

    function _bilateral() internal returns (Venue0Settlement.SettlementPlan memory) {
        address a = wallets[0].addr;
        address b = wallets[1].addr;
        _fund(nvda, a, 10 * UNIT);
        _fund(aapl, b, 7 * UNIT);
        Venue0Settlement.Leg[] memory legs = new Venue0Settlement.Leg[](2);
        legs[0] = Venue0Settlement.Leg(address(nvda), a, b, 3 * UNIT);
        legs[1] = Venue0Settlement.Leg(address(aapl), b, a, 2 * UNIT);
        return _basePlan(_pair(), legs);
    }

    /// A sells NVDA wants AAPL; B sells AAPL wants SPY; C sells SPY wants NVDA.
    function _cycle() internal returns (Venue0Settlement.SettlementPlan memory) {
        address a = wallets[0].addr;
        address b = wallets[1].addr;
        address c = wallets[2].addr;
        _fund(nvda, a, 5 * UNIT);
        _fund(aapl, b, 5 * UNIT);
        _fund(spy, c, 5 * UNIT);
        Venue0Settlement.Leg[] memory legs = new Venue0Settlement.Leg[](3);
        legs[0] = Venue0Settlement.Leg(address(nvda), a, c, 1 * UNIT);
        legs[1] = Venue0Settlement.Leg(address(spy), c, b, 2 * UNIT);
        legs[2] = Venue0Settlement.Leg(address(aapl), b, a, 3 * UNIT);
        return _basePlan(_trio(), legs);
    }

    // ---------------------------------------------------------------- happy paths

    function test_bilateralSettlesAtomically() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        address a = wallets[0].addr;
        address b = wallets[1].addr;

        bytes32 planHash = settlement.settle(plan, _approvals(plan, 0));

        assertEq(nvda.balanceOf(a), 7 * UNIT);
        assertEq(nvda.balanceOf(b), 3 * UNIT);
        assertEq(aapl.balanceOf(a), 2 * UNIT);
        assertEq(aapl.balanceOf(b), 5 * UNIT);
        assertTrue(settlement.planSettled(planHash));
        assertTrue(settlement.nonceUsed(a, 0));
        assertTrue(settlement.nonceUsed(b, 1));
        assertEq(nvda.balanceOf(address(settlement)), 0);
        assertEq(aapl.balanceOf(address(settlement)), 0);
    }

    function test_threeWalletCycleSettles() public {
        Venue0Settlement.SettlementPlan memory plan = _cycle();
        address a = wallets[0].addr;
        address b = wallets[1].addr;
        address c = wallets[2].addr;

        vm.expectEmit(true, true, true, true, address(settlement));
        emit Venue0Settlement.PlanSettled(plan.roundId, plan.planId, settlement.hashPlan(plan), 3, 3);
        settlement.settle(plan, _approvals(plan, 100));

        assertEq(nvda.balanceOf(a), 4 * UNIT);
        assertEq(nvda.balanceOf(c), 1 * UNIT);
        assertEq(spy.balanceOf(c), 3 * UNIT);
        assertEq(spy.balanceOf(b), 2 * UNIT);
        assertEq(aapl.balanceOf(b), 2 * UNIT);
        assertEq(aapl.balanceOf(a), 3 * UNIT);
        assertEq(nvda.balanceOf(address(settlement)) + aapl.balanceOf(address(settlement)) + spy.balanceOf(address(settlement)), 0);
    }

    function test_emitsOneEventPerLeg() public {
        Venue0Settlement.SettlementPlan memory plan = _cycle();
        bytes32 planHash = settlement.hashPlan(plan);
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        for (uint256 i = 0; i < plan.legs.length; ++i) {
            Venue0Settlement.Leg memory leg = plan.legs[i];
            vm.expectEmit(true, true, true, true, address(settlement));
            emit Venue0Settlement.CrossingLeg(planHash, leg.token, leg.from, leg.to, leg.amount);
        }
        settlement.settle(plan, approvals);
    }

    function test_anyoneMaySubmitSignedPlan() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.prank(makeAddr("relayer"));
        settlement.settle(plan, approvals);
        assertEq(nvda.balanceOf(wallets[1].addr), 3 * UNIT);
    }

    // ---------------------------------------------------------------- signatures and replay

    function test_acceptsEcdsaFromEip7702DelegatedEoa() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        address delegate = makeAddr("delegate");
        for (uint256 i = 0; i < plan.participants.length; ++i) {
            vm.etch(plan.participants[i], abi.encodePacked(hex"ef0100", delegate));
        }
        settlement.settle(plan, approvals);
        assertEq(nvda.balanceOf(wallets[1].addr), 3 * UNIT);
    }

    function test_acceptsErc1271SmartAccount() public {
        (address ownerAddr, uint256 ownerKey) = makeAddrAndKey("smart-owner");
        SmartAccount account = new SmartAccount(ownerAddr);
        address a = wallets[0].addr;
        address smart = address(account);
        _fund(nvda, a, 4 * UNIT);
        aapl.mint(smart, 4 * UNIT);
        vm.prank(ownerAddr);
        account.approveToken(address(aapl), address(settlement), 4 * UNIT);

        address[] memory participants = new address[](2);
        (participants[0], participants[1]) = a < smart ? (a, smart) : (smart, a);
        Venue0Settlement.Leg[] memory legs = new Venue0Settlement.Leg[](2);
        legs[0] = Venue0Settlement.Leg(address(nvda), a, smart, 1 * UNIT);
        legs[1] = Venue0Settlement.Leg(address(aapl), smart, a, 2 * UNIT);
        Venue0Settlement.SettlementPlan memory plan = _basePlan(participants, legs);

        Venue0Settlement.Approval[] memory approvals = new Venue0Settlement.Approval[](2);
        for (uint256 i = 0; i < 2; ++i) {
            uint256 key = participants[i] == smart ? ownerKey : wallets[0].key;
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, settlement.approvalDigest(plan, participants[i], i));
            approvals[i] = Venue0Settlement.Approval(i, abi.encodePacked(r, s, v));
        }
        settlement.settle(plan, approvals);
        assertEq(aapl.balanceOf(a), 2 * UNIT);
        assertEq(nvda.balanceOf(smart), 1 * UNIT);
    }

    function test_rejectsWrongKeyForSmartAccount() public {
        SmartAccount account = new SmartAccount(makeAddr("smart-owner"));
        address smart = address(account);
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        plan.legs[0].to = smart;
        plan.legs[1].from = smart;
        address[] memory participants = new address[](2);
        (participants[0], participants[1]) = wallets[0].addr < smart ? (wallets[0].addr, smart) : (smart, wallets[0].addr);
        plan.participants = participants;
        plan.legs = _sortLegs(plan.legs);
        Venue0Settlement.Approval[] memory approvals = new Venue0Settlement.Approval[](2);
        for (uint256 i = 0; i < 2; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(wallets[3].key, settlement.approvalDigest(plan, participants[i], i));
            approvals[i] = Venue0Settlement.Approval(i, abi.encodePacked(r, s, v));
        }
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, participants[0]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsInvalidSignature() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        bytes32 digest = settlement.approvalDigest(plan, plan.participants[1], approvals[1].nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wallets[3].key, digest);
        approvals[1].signature = abi.encodePacked(r, s, v);

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, plan.participants[1]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsTamperedPlan() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        plan.legs[0].amount += 1;

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, plan.participants[0]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsTamperedSnapshotHash() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        plan.valuationSnapshotHash = keccak256("other-snapshot");

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, plan.participants[0]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsSignatureForOtherNonce() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        approvals[0].nonce = 999;

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, plan.participants[0]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsWrongDomainChainId() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.chainId(46630);

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, plan.participants[0]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsSignatureForOtherSettlementContract() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement other = new Venue0Settlement();
        Venue0Settlement.Approval[] memory approvals = new Venue0Settlement.Approval[](2);
        for (uint256 i = 0; i < 2; ++i) {
            bytes32 digest = other.approvalDigest(plan, plan.participants[i], i);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(_keyOf(plan.participants[i]), digest);
            approvals[i] = Venue0Settlement.Approval(i, abi.encodePacked(r, s, v));
        }

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.InvalidSignature.selector, plan.participants[0]));
        settlement.settle(plan, approvals);
    }

    function test_rejectsReplayOfSettledPlan() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        bytes32 planHash = settlement.settle(plan, approvals);

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.PlanAlreadySettled.selector, planHash));
        settlement.settle(plan, approvals);
    }

    function test_rejectsReusedNonceAcrossPlans() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        settlement.settle(plan, _approvals(plan, 0));

        plan.planId = keccak256("plan-2");
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.NonceAlreadyUsed.selector, plan.participants[0], 0));
        settlement.settle(plan, approvals);
    }

    function test_cancelledNonceBlocksSettlement() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.prank(plan.participants[1]);
        settlement.cancelNonce(1);

        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.NonceAlreadyUsed.selector, plan.participants[1], 1));
        settlement.settle(plan, approvals);
    }

    function test_rejectsApprovalCountMismatch() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = new Venue0Settlement.Approval[](1);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.ApprovalCountMismatch.selector, 2, 1));
        settlement.settle(plan, approvals);
    }

    // ---------------------------------------------------------------- time bounds

    function test_rejectsExpiredPlan() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.warp(plan.validUntil + 1);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.PlanExpired.selector, plan.validUntil));
        settlement.settle(plan, approvals);
    }

    function test_rejectsNotYetValidPlan() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        plan.validAfter = uint64(block.timestamp + 10);
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.PlanNotYetValid.selector, plan.validAfter));
        settlement.settle(plan, approvals);
    }

    // ---------------------------------------------------------------- plan shape

    function test_rejectsZeroAmountLeg() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        plan.legs[0].amount = 0;
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.ZeroAmount.selector, 0));
        settlement.settle(plan, approvals);
    }

    function test_rejectsDuplicateLeg() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        Venue0Settlement.Leg[] memory legs = new Venue0Settlement.Leg[](3);
        legs[0] = plan.legs[0];
        legs[1] = plan.legs[0];
        legs[2] = plan.legs[1];
        plan.legs = legs;
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.LegsNotSorted.selector, 1));
        settlement.settle(plan, approvals);
    }

    function test_rejectsUnsortedLegs() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        (plan.legs[0], plan.legs[1]) = (plan.legs[1], plan.legs[0]);
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.LegsNotSorted.selector, 1));
        settlement.settle(plan, approvals);
    }

    function test_rejectsUnsortedParticipants() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        (plan.participants[0], plan.participants[1]) = (plan.participants[1], plan.participants[0]);
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.ParticipantsNotSorted.selector, 1));
        settlement.settle(plan, approvals);
    }

    function test_rejectsLegPartyOutsideParticipants() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        address outsider = wallets[3].addr;
        plan.legs[1].to = outsider;
        plan.legs = _sortLegs(plan.legs);
        uint256 badIndex = plan.legs[0].to == outsider ? 0 : 1;
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.UnknownParty.selector, badIndex, outsider));
        settlement.settle(plan, approvals);
    }

    function test_rejectsIdleParticipant() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        plan.participants = _trio();
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.IdleParticipant.selector, wallets[2].addr));
        settlement.settle(plan, approvals);
    }

    function test_rejectsSelfTransfer() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        plan.legs[0].to = plan.legs[0].from;
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);
        vm.expectRevert(abi.encodeWithSelector(Venue0Settlement.SelfTransfer.selector, 0));
        settlement.settle(plan, approvals);
    }

    function test_rejectsSingleParticipant() public {
        Venue0Settlement.SettlementPlan memory plan = _bilateral();
        address[] memory solo = new address[](1);
        solo[0] = wallets[0].addr;
        plan.participants = solo;
        vm.expectRevert(Venue0Settlement.TooFewParticipants.selector);
        settlement.settle(plan, new Venue0Settlement.Approval[](1));
    }

    // ---------------------------------------------------------------- atomicity

    function test_insufficientAllowanceRevertsEverything() public {
        Venue0Settlement.SettlementPlan memory plan = _cycle();
        address c = wallets[2].addr;
        vm.prank(c);
        spy.approve(address(settlement), 1 * UNIT);
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(settlement), 1 * UNIT, 2 * UNIT)
        );
        settlement.settle(plan, approvals);
        _assertCycleUntouched();
    }

    function test_insufficientBalanceRevertsEverything() public {
        Venue0Settlement.SettlementPlan memory plan = _cycle();
        address b = wallets[1].addr;
        vm.prank(b);
        aapl.transfer(makeAddr("elsewhere"), 4 * UNIT);
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, b, 1 * UNIT, 3 * UNIT));
        settlement.settle(plan, approvals);
        assertEq(nvda.balanceOf(wallets[0].addr), 5 * UNIT);
        assertEq(spy.balanceOf(wallets[2].addr), 5 * UNIT);
        assertFalse(settlement.planSettled(settlement.hashPlan(plan)));
        assertFalse(settlement.nonceUsed(wallets[0].addr, 0));
    }

    function test_pausedTokenLegRevertsEverything() public {
        Venue0Settlement.SettlementPlan memory plan = _cycle();
        PausedToken paused = new PausedToken();
        _replaceToken(plan, address(spy), address(paused));
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);

        vm.expectRevert(bytes("token paused"));
        settlement.settle(plan, approvals);
        _assertCycleUntouched();
    }

    function test_falseReturningTokenRevertsEverything() public {
        Venue0Settlement.SettlementPlan memory plan = _cycle();
        FalseReturningToken bad = new FalseReturningToken();
        _replaceToken(plan, address(spy), address(bad));
        Venue0Settlement.Approval[] memory approvals = _approvals(plan, 0);

        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(bad)));
        settlement.settle(plan, approvals);
        _assertCycleUntouched();
    }

    function _replaceToken(Venue0Settlement.SettlementPlan memory plan, address from, address to) internal pure {
        for (uint256 i = 0; i < plan.legs.length; ++i) {
            if (plan.legs[i].token == from) plan.legs[i].token = to;
        }
        plan.legs = _sortLegs(plan.legs);
    }

    function _assertCycleUntouched() internal view {
        assertEq(nvda.balanceOf(wallets[0].addr), 5 * UNIT);
        assertEq(aapl.balanceOf(wallets[1].addr), 5 * UNIT);
        assertEq(spy.balanceOf(wallets[2].addr), 5 * UNIT);
        assertEq(nvda.balanceOf(wallets[2].addr), 0);
        assertEq(aapl.balanceOf(wallets[0].addr), 0);
    }

    // ---------------------------------------------------------------- fuzz

    /// Random 4-wallet, 3-token plans: every token's total across wallets is conserved,
    /// each wallet's net change equals the plan's net delta, and the contract never retains tokens.
    function testFuzz_conservationAndExactNetDeltas(uint256 seed, uint8 legCountRaw) public {
        Venue0Settlement.Leg[] memory legs = _fuzzLegs(seed, bound(legCountRaw, 1, 12));
        address[] memory participants = _fundLegParties(legs);
        int256[4][3] memory expected = _expectedDeltas(legs);
        uint256[4][3] memory before = _balances();

        Venue0Settlement.SettlementPlan memory plan = _basePlan(participants, legs);
        settlement.settle(plan, _approvals(plan, seed % 1e9));

        _assertDeltas(before, expected);
    }

    function _tokens() internal view returns (MockStockToken[3] memory) {
        return [nvda, aapl, spy];
    }

    function _fuzzLegs(uint256 seed, uint256 legCount) internal view returns (Venue0Settlement.Leg[] memory legs) {
        MockStockToken[3] memory tokens = _tokens();
        legs = new Venue0Settlement.Leg[](legCount);
        uint256 used;
        for (uint256 i = 0; i < legCount; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint256 fromIdx = (r >> 8) % 4;
            Venue0Settlement.Leg memory leg = Venue0Settlement.Leg(
                address(tokens[r % 3]),
                wallets[fromIdx].addr,
                wallets[(fromIdx + 1 + ((r >> 16) % 3)) % 4].addr,
                1 + ((r >> 24) % (1_000 * UNIT))
            );
            bool duplicate;
            for (uint256 j = 0; j < used; ++j) {
                if (legs[j].token == leg.token && legs[j].from == leg.from && legs[j].to == leg.to) duplicate = true;
            }
            if (!duplicate) legs[used++] = leg;
        }
        assembly {
            mstore(legs, used)
        }
    }

    function _fundLegParties(Venue0Settlement.Leg[] memory legs) internal returns (address[] memory participants) {
        bool[4] memory active;
        for (uint256 i = 0; i < legs.length; ++i) {
            MockStockToken(legs[i].token).mint(legs[i].from, legs[i].amount);
            vm.prank(legs[i].from);
            MockStockToken(legs[i].token).approve(address(settlement), type(uint256).max);
            for (uint256 w = 0; w < 4; ++w) {
                if (wallets[w].addr == legs[i].from || wallets[w].addr == legs[i].to) active[w] = true;
            }
        }
        uint256 count;
        for (uint256 w = 0; w < 4; ++w) {
            if (active[w]) count++;
        }
        participants = new address[](count);
        uint256 k;
        for (uint256 w = 0; w < 4; ++w) {
            if (active[w]) participants[k++] = wallets[w].addr;
        }
    }

    function _expectedDeltas(Venue0Settlement.Leg[] memory legs) internal view returns (int256[4][3] memory expected) {
        for (uint256 i = 0; i < legs.length; ++i) {
            uint256 t = legs[i].token == address(nvda) ? 0 : legs[i].token == address(aapl) ? 1 : 2;
            for (uint256 w = 0; w < 4; ++w) {
                if (wallets[w].addr == legs[i].from) expected[t][w] -= int256(legs[i].amount);
                if (wallets[w].addr == legs[i].to) expected[t][w] += int256(legs[i].amount);
            }
        }
    }

    function _balances() internal view returns (uint256[4][3] memory balances) {
        MockStockToken[3] memory tokens = _tokens();
        for (uint256 t = 0; t < 3; ++t) {
            for (uint256 w = 0; w < 4; ++w) {
                balances[t][w] = tokens[t].balanceOf(wallets[w].addr);
            }
        }
    }

    function _assertDeltas(uint256[4][3] memory before, int256[4][3] memory expected) internal view {
        MockStockToken[3] memory tokens = _tokens();
        uint256[4][3] memory afterBalances = _balances();
        for (uint256 t = 0; t < 3; ++t) {
            int256 sum;
            for (uint256 w = 0; w < 4; ++w) {
                int256 delta = int256(afterBalances[t][w]) - int256(before[t][w]);
                assertEq(delta, expected[t][w]);
                sum += delta;
            }
            assertEq(sum, 0);
            assertEq(tokens[t].balanceOf(address(settlement)), 0);
        }
    }
}
