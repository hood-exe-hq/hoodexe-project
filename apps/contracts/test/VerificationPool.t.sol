// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {VerificationPool} from "../src/VerificationPool.sol";
import {RigorRegistry} from "../src/RigorRegistry.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";

/// A submitter that refuses ETH, to exercise the owed/claim path.
contract Refuser {
    bool public accept;

    function setAccept(bool a) external {
        accept = a;
    }

    function submit(VerificationPool pool, address token, bytes32 proofHash) external payable returns (bytes32) {
        return pool.submit{value: msg.value}(token, proofHash, "bafy-refuser");
    }

    function claim(VerificationPool pool) external {
        pool.claim();
    }

    receive() external payable {
        require(accept, "no thanks");
    }
}

contract VerificationPoolTest is Test {
    VerificationPool pool;
    RigorRegistry registry;

    address owner = makeAddr("owner");
    uint256 botKey = 0xB07;
    address bot;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address token = makeAddr("COLLATZ");
    uint256 constant FEE = 0.01 ether;

    function setUp() public {
        bot = vm.addr(botKey);
        registry = new RigorRegistry(owner);
        pool = new VerificationPool(owner, bot, address(registry));
        vm.prank(owner);
        registry.setVerificationPool(address(pool));
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.warp(1_800_000_000);
    }

    function _submit(address who, bytes32 proofHash) internal returns (bytes32) {
        vm.prank(who);
        return pool.submit{value: FEE}(token, proofHash, "bafyproof");
    }

    function _sign(bytes32 id, VerificationPool.Tier tier, uint256 deadline, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pool.verifyDigest(id, tier, deadline));
        return abi.encodePacked(r, s, v);
    }

    function _fund(uint256 amount) internal {
        vm.deal(address(this), amount);
        (bool ok,) = address(pool).call{value: amount}("");
        assertTrue(ok);
    }

    // ── submit ──

    function test_submitRecordsAndHoldsTheFee() public {
        bytes32 id = _submit(alice, keccak256("p1"));
        VerificationPool.Submission memory s = pool.getSubmission(id);
        assertEq(s.submitter, alice);
        assertEq(s.token, token);
        assertEq(uint8(s.status), uint8(VerificationPool.Status.Pending));
        assertEq(pool.pendingFees(), FEE);
        assertEq(pool.availableBalance(), 0);
        assertEq(pool.userSubmissions(alice).length, 1);
    }

    function test_submitNeedsTheExactFee() public {
        vm.prank(alice);
        vm.expectRevert(VerificationPool.WrongFee.selector);
        pool.submit{value: FEE - 1}(token, keccak256("p"), "bafy");
    }

    function test_submitRejectsBadInput() public {
        vm.startPrank(alice);
        vm.expectRevert(VerificationPool.BadInput.selector);
        pool.submit{value: FEE}(address(0), keccak256("p"), "bafy");
        vm.expectRevert(VerificationPool.BadInput.selector);
        pool.submit{value: FEE}(token, bytes32(0), "bafy");
        vm.expectRevert(VerificationPool.BadInput.selector);
        pool.submit{value: FEE}(token, keccak256("p"), "");
        vm.stopPrank();
    }

    function test_sameProofForTheSameCoinIsTakenOnce() public {
        _submit(alice, keccak256("p1"));
        vm.prank(bob);
        vm.expectRevert(VerificationPool.DuplicateProof.selector);
        pool.submit{value: FEE}(token, keccak256("p1"), "bafy");
    }

    function test_weeklyLimitIsRolling() public {
        _submit(alice, keccak256("a"));
        vm.warp(block.timestamp + 1 days);
        _submit(alice, keccak256("b"));
        _submit(alice, keccak256("c"));
        vm.prank(alice);
        vm.expectRevert(VerificationPool.WeeklyLimit.selector);
        pool.submit{value: FEE}(token, keccak256("d"), "bafy");
        // A week after the first one, a slot frees up; the next two are still inside the window.
        vm.warp(block.timestamp + 6 days);
        _submit(alice, keccak256("d"));
        vm.prank(alice);
        vm.expectRevert(VerificationPool.WeeklyLimit.selector);
        pool.submit{value: FEE}(token, keccak256("e"), "bafy");
        // Others are unaffected.
        _submit(bob, keccak256("f"));
    }

    function test_submissionsCanBePaused() public {
        vm.prank(owner);
        pool.setSubmissionsPaused(true);
        vm.prank(alice);
        vm.expectRevert(VerificationPool.SubmissionsPaused.selector);
        pool.submit{value: FEE}(token, keccak256("p"), "bafy");
    }

    // ── markVerified ──

    function test_markVerifiedUpgradesTheCoinAndPays() public {
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 before = alice.balance;
        uint256 deadline = block.timestamp + 1 hours;
        // Anyone can relay the bot's signature.
        vm.prank(bob);
        pool.markVerified(id, VerificationPool.Tier.MEDIUM, deadline, _sign(id, VerificationPool.Tier.MEDIUM, deadline, botKey));

        assertEq(alice.balance - before, 0.25 ether);
        assertTrue(registry.isFormallyVerified(token));
        assertEq(registry.rigorScore(token), 100);
        VerificationPool.Submission memory s = pool.getSubmission(id);
        assertEq(uint8(s.status), uint8(VerificationPool.Status.Verified));
        assertEq(uint8(s.tier), uint8(VerificationPool.Tier.MEDIUM));
        assertEq(s.reward, 0.25 ether);
        assertEq(pool.pendingFees(), 0);
        // The fee joined the pool.
        assertEq(address(pool).balance, 2 ether + FEE - 0.25 ether);
    }

    function test_markVerifiedNeedsTheBotsSignatureForThatTier() public {
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory forged = _sign(id, VerificationPool.Tier.OPEN, deadline, 0xBAD);
        vm.expectRevert(VerificationPool.BadSignature.selector);
        pool.markVerified(id, VerificationPool.Tier.OPEN, deadline, forged);
        // A real signature for SIMPLE can't be used to claim OPEN.
        bytes memory simple = _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey);
        vm.expectRevert(VerificationPool.BadSignature.selector);
        pool.markVerified(id, VerificationPool.Tier.OPEN, deadline, simple);
        vm.expectRevert(VerificationPool.BadSignature.selector);
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, hex"1234");
    }

    function test_aSignatureIsNotReplayable() public {
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey);
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, sig);
        vm.expectRevert(VerificationPool.NotPending.selector);
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, sig);
    }

    function test_aSignatureForOnePoolDoesNotWorkOnAnother() public {
        RigorRegistry registry2 = new RigorRegistry(owner);
        VerificationPool pool2 = new VerificationPool(owner, bot, address(registry2));
        vm.prank(owner);
        registry2.setVerificationPool(address(pool2));
        vm.deal(address(pool2), 2 ether);
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, VerificationPool.Tier.HARD, deadline, botKey);
        // pool2 has no such submission, and the digest is bound to pool's address anyway.
        vm.expectRevert(VerificationPool.NotPending.selector);
        pool2.markVerified(id, VerificationPool.Tier.HARD, deadline, sig);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(botKey, pool.verifyDigest(id, VerificationPool.Tier.HARD, deadline));
        assertTrue(pool2.verifyDigest(id, VerificationPool.Tier.HARD, deadline) != pool.verifyDigest(id, VerificationPool.Tier.HARD, deadline));
        assertEq(abi.encodePacked(r, s, v), sig);
    }

    function test_expiredSignaturesAreRefused() public {
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey);
        vm.warp(deadline + 1);
        vm.expectRevert(VerificationPool.Expired.selector);
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, sig);
    }

    function test_aDepletedPoolRefusesThePayoutAndKeepsTheSubmissionPending() public {
        _fund(0.3 ether); // MEDIUM 0.25 + min balance 0.1 = 0.35 needed
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, VerificationPool.Tier.MEDIUM, deadline, botKey);
        vm.expectRevert(VerificationPool.PoolDepleted.selector);
        pool.markVerified(id, VerificationPool.Tier.MEDIUM, deadline, sig);
        assertEq(uint8(pool.getSubmission(id).status), uint8(VerificationPool.Status.Pending));
        assertFalse(registry.isFormallyVerified(token));
        // Topped up, the same signature goes through.
        _fund(0.1 ether);
        pool.markVerified(id, VerificationPool.Tier.MEDIUM, deadline, sig);
        assertTrue(registry.isFormallyVerified(token));
    }

    function test_pendingFeesAreNeverSpentOnRewards() public {
        // Only fees in the pool: 3 pending submissions' worth, no free balance at all.
        bytes32 id = _submit(alice, keccak256("a"));
        _submit(bob, keccak256("b"));
        vm.prank(owner);
        pool.setMinPoolBalance(0);
        uint256 deadline = block.timestamp + 1 hours;
        // The verified submission's own fee becomes free, which covers TRIVIAL (0.01) but no more.
        pool.markVerified(id, VerificationPool.Tier.TRIVIAL, deadline, _sign(id, VerificationPool.Tier.TRIVIAL, deadline, botKey));
        assertEq(pool.pendingFees(), FEE);
        assertEq(address(pool).balance, FEE);
    }

    function test_payoutsCanBePaused() public {
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey);
        vm.prank(owner);
        pool.pausePayouts();
        vm.expectRevert(VerificationPool.PayoutsPaused.selector);
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, sig);
        vm.prank(owner);
        pool.resumePayouts();
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, sig);
    }

    function test_aSubmitterThatRefusesETHCanClaimLater() public {
        _fund(2 ether);
        Refuser r = new Refuser();
        vm.deal(address(this), FEE);
        bytes32 id = r.submit{value: FEE}(pool, token, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey));
        // Verified anyway; the reward waits.
        assertTrue(registry.isFormallyVerified(token));
        assertEq(pool.owed(address(r)), 0.05 ether);
        assertEq(pool.totalOwed(), 0.05 ether);
        r.setAccept(true);
        uint256 before = address(r).balance;
        r.claim(pool);
        assertEq(address(r).balance - before, 0.05 ether);
        assertEq(pool.totalOwed(), 0);
        vm.expectRevert(VerificationPool.NothingOwed.selector);
        r.claim(pool);
    }

    // ── markFailed / refund ──

    function test_onlyTheBotMarksFailures_andTheFeeStays() public {
        bytes32 id = _submit(alice, keccak256("p1"));
        vm.prank(alice);
        vm.expectRevert(VerificationPool.NotBot.selector);
        pool.markFailed(id, "nope");
        vm.prank(bot);
        pool.markFailed(id, "error: unknown identifier 'foo'");
        assertEq(uint8(pool.getSubmission(id).status), uint8(VerificationPool.Status.Failed));
        assertEq(pool.pendingFees(), 0);
        assertEq(pool.availableBalance(), FEE);
        // A failed proof can't then be verified.
        uint256 deadline = block.timestamp + 1 hours;
        _fund(2 ether);
        bytes memory sig = _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey);
        vm.expectRevert(VerificationPool.NotPending.selector);
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, sig);
    }

    function test_ownerRefundsAPendingSubmission_whichCanThenBeResubmitted() public {
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 before = alice.balance;
        vm.prank(bob);
        vm.expectRevert();
        pool.refund(id);
        vm.prank(owner);
        pool.refund(id);
        assertEq(alice.balance - before, FEE);
        assertEq(pool.pendingFees(), 0);
        assertEq(uint8(pool.getSubmission(id).status), uint8(VerificationPool.Status.Refunded));
        _submit(alice, keccak256("p1"));
    }

    // ── admin ──

    function test_withdrawExcessIsCappedAt20PercentOncePerWeek() public {
        _fund(10 ether);
        _submit(alice, keccak256("p1")); // pending fee is not withdrawable
        vm.startPrank(owner);
        vm.expectRevert(VerificationPool.TooMuch.selector);
        pool.withdrawExcess(2 ether + 1);
        pool.withdrawExcess(2 ether);
        assertEq(owner.balance, 2 ether);
        vm.expectRevert(VerificationPool.TooSoon.selector);
        pool.withdrawExcess(1);
        vm.warp(block.timestamp + 7 days);
        pool.withdrawExcess(1.6 ether);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert();
        pool.withdrawExcess(1);
    }

    function test_onlyTheOwnerConfigures() public {
        vm.startPrank(alice);
        vm.expectRevert();
        pool.setRewardAmount(VerificationPool.Tier.OPEN, 100 ether);
        vm.expectRevert();
        pool.setVerifierBot(alice);
        vm.expectRevert();
        pool.pausePayouts();
        vm.stopPrank();
        vm.prank(owner);
        pool.setRewardAmount(VerificationPool.Tier.OPEN, 5 ether);
        assertEq(pool.rewardAmount(VerificationPool.Tier.OPEN), 5 ether);
    }

    function test_onlyThePoolUpgradesAndTheOwnerCanRevoke() public {
        vm.expectRevert(RigorRegistry.NotPool.selector);
        registry.upgradeToFormal(token);
        _fund(2 ether);
        bytes32 id = _submit(alice, keccak256("p1"));
        uint256 deadline = block.timestamp + 1 hours;
        pool.markVerified(id, VerificationPool.Tier.SIMPLE, deadline, _sign(id, VerificationPool.Tier.SIMPLE, deadline, botKey));
        vm.prank(owner);
        registry.revokeFormal(token, "proof states a different theorem");
        assertFalse(registry.isFormallyVerified(token));
        assertEq(registry.rigorScore(token), 0);
    }
}

contract FeeSplitterTest is Test {
    FeeSplitter splitter;
    address owner = makeAddr("owner");
    address payable operator = payable(makeAddr("operator"));
    address payable pool = payable(makeAddr("pool"));

    function setUp() public {
        splitter = new FeeSplitter(owner, operator, pool);
    }

    function test_splits30PercentToThePool() public {
        vm.deal(address(this), 1 ether);
        splitter.distributeFee{value: 1 ether}();
        assertEq(pool.balance, 0.3 ether);
        assertEq(operator.balance, 0.7 ether);
    }

    function test_distributesWhatWasSentEarlierToo() public {
        vm.deal(address(this), 2 ether);
        (bool ok,) = address(splitter).call{value: 1 ether}("");
        assertTrue(ok);
        splitter.distributeFee{value: 1 ether}();
        assertEq(pool.balance, 0.6 ether);
        assertEq(operator.balance, 1.4 ether);
        vm.expectRevert(FeeSplitter.NothingToDistribute.selector);
        splitter.distributeFee();
    }

    function test_splitIsGovernableUpToHalf() public {
        vm.prank(owner);
        splitter.setPoolBps(5_000);
        vm.prank(owner);
        vm.expectRevert(FeeSplitter.BpsTooHigh.selector);
        splitter.setPoolBps(5_001);
        vm.expectRevert();
        splitter.setPoolBps(1_000);
        vm.deal(address(this), 1 ether);
        splitter.distributeFee{value: 1 ether}();
        assertEq(pool.balance, 0.5 ether);
    }

    function testFuzz_splitAddsUp(uint96 amount, uint16 bps) public {
        vm.assume(amount > 0);
        bps = uint16(bound(bps, 0, 5_000));
        vm.prank(owner);
        splitter.setPoolBps(bps);
        vm.deal(address(this), amount);
        splitter.distributeFee{value: amount}();
        assertEq(pool.balance + operator.balance, amount);
        assertEq(pool.balance, (uint256(amount) * bps) / 10_000);
    }
}
