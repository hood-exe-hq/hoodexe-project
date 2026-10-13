// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IRigorRegistry} from "./IRigorRegistry.sol";

/// @title hood.exe formal verification pool
/// @notice Holds the reward pool for formal (Lean 4) proofs of hood.exe coins' theorems. Anyone submits a proof
/// (pinned to IPFS) with a fee; the off-chain checker compiles it, the admin reviews the passed proof and its tier,
/// and only then does the verifier bot sign an EIP-712 approval that anyone can relay to markVerified, which
/// upgrades the coin in the RigorRegistry and pays the reward. Nothing pays out without that signature.
///
/// Money the pool owes is never spent on rewards: fees of pending submissions (refundable by the owner) and rewards
/// that could not be sent (claimable) are held back from the available balance.
contract VerificationPool is Ownable2Step, ReentrancyGuard, EIP712 {
    enum Tier {
        TRIVIAL,
        SIMPLE,
        MEDIUM,
        HARD,
        OPEN
    }

    enum Status {
        None,
        Pending,
        Verified,
        Failed,
        Refunded
    }

    struct Submission {
        address submitter;
        address token;
        bytes32 proofHash;
        string ipfsCid;
        uint64 submittedAt;
        Status status;
        Tier tier;
        uint256 feePaid;
        uint256 reward;
    }

    bytes32 public constant VERIFY_TYPEHASH = keccak256("Verify(bytes32 id,uint8 tier,uint256 deadline)");
    uint256 public constant WEEK = 7 days;
    /// @notice withdrawExcess takes at most this share of the available balance, at most once a week.
    uint256 public constant MAX_WITHDRAW_BPS = 2_000;
    uint256 public constant MAX_CID_LENGTH = 128;
    uint256 public constant MAX_REASON_LENGTH = 256;

    IRigorRegistry public rigorRegistry;
    address public verifierBot;

    uint256 public submissionFee = 0.01 ether;
    /// @notice A payout must leave at least this much available in the pool.
    uint256 public minPoolBalance = 0.1 ether;
    uint8 public maxPerWeek = 3;
    bool public submissionsPaused;
    bool public payoutsPaused;

    mapping(Tier tier => uint256) public rewardAmount;

    /// @notice Fees of submissions still pending: refundable, so not available for rewards.
    uint256 public pendingFees;
    /// @notice Rewards and refunds that could not be sent, waiting for claim().
    uint256 public totalOwed;
    mapping(address account => uint256) public owed;
    uint256 public lastWithdrawAt;
    uint256 private _nonce;

    mapping(bytes32 id => Submission) private _submissions;
    mapping(address submitter => bytes32[]) private _userSubmissions;
    /// @notice keccak256(token, proofHash) of every proof submitted and not refunded: the same proof is taken once.
    mapping(bytes32 key => bool) public proofSubmitted;

    event Submitted(bytes32 indexed id, address indexed submitter, address indexed token, bytes32 proofHash, string ipfsCid);
    event Verified(bytes32 indexed id, Tier tier, uint256 reward);
    event Failed(bytes32 indexed id, string reason);
    event Refunded(bytes32 indexed id, uint256 amount);
    event Owed(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 amount);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event RewardAmountSet(Tier tier, uint256 amount);
    event SubmissionFeeSet(uint256 fee);
    event MinPoolBalanceSet(uint256 amount);
    event MaxPerWeekSet(uint8 maxPerWeek);
    event VerifierBotSet(address indexed bot);
    event RigorRegistrySet(address indexed registry);
    event SubmissionsPausedSet(bool paused);
    event PayoutsPausedSet(bool paused);

    error SubmissionsPaused();
    error PayoutsPaused();
    error WrongFee();
    error BadInput();
    error DuplicateProof();
    error WeeklyLimit();
    error NotPending();
    error Expired();
    error BadSignature();
    error PoolDepleted();
    error NotBot();
    error NothingOwed();
    error TooMuch();
    error TooSoon();
    error TransferFailed();
    error ZeroAddress();

    constructor(address owner_, address verifierBot_, address rigorRegistry_)
        Ownable(owner_)
        EIP712("hood.exe VerificationPool", "1")
    {
        if (verifierBot_ == address(0) || rigorRegistry_ == address(0)) revert ZeroAddress();
        verifierBot = verifierBot_;
        rigorRegistry = IRigorRegistry(rigorRegistry_);
        rewardAmount[Tier.TRIVIAL] = 0.01 ether;
        rewardAmount[Tier.SIMPLE] = 0.05 ether;
        rewardAmount[Tier.MEDIUM] = 0.25 ether;
        rewardAmount[Tier.HARD] = 1 ether;
        rewardAmount[Tier.OPEN] = 10 ether;
    }

    /// @notice Deposits (fee splitter, seed funding) grow the pool.
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ── Submissions ──────────────────────────────────────────────────────────────

    /// @notice Queues a proof of `token`'s theorem for verification, paying the submission fee.
    /// @param proofHash sha256 of the proof.lean file; @param ipfsCid where the file is pinned.
    function submit(address token, bytes32 proofHash, string calldata ipfsCid) external payable returns (bytes32 id) {
        if (submissionsPaused) revert SubmissionsPaused();
        if (msg.value != submissionFee) revert WrongFee();
        uint256 cidLength = bytes(ipfsCid).length;
        if (token == address(0) || proofHash == bytes32(0) || cidLength == 0 || cidLength > MAX_CID_LENGTH) {
            revert BadInput();
        }
        bytes32 key = keccak256(abi.encode(token, proofHash));
        if (proofSubmitted[key]) revert DuplicateProof();
        // The maxPerWeek-th most recent submission must be a week old: a constant-time rolling limit.
        bytes32[] storage mine = _userSubmissions[msg.sender];
        if (mine.length >= maxPerWeek && block.timestamp < _submissions[mine[mine.length - maxPerWeek]].submittedAt + WEEK) {
            revert WeeklyLimit();
        }

        proofSubmitted[key] = true;
        id = keccak256(abi.encode(block.chainid, address(this), msg.sender, token, proofHash, _nonce++));
        _submissions[id] = Submission({
            submitter: msg.sender,
            token: token,
            proofHash: proofHash,
            ipfsCid: ipfsCid,
            submittedAt: uint64(block.timestamp),
            status: Status.Pending,
            tier: Tier.TRIVIAL,
            feePaid: msg.value,
            reward: 0
        });
        mine.push(id);
        pendingFees += msg.value;
        emit Submitted(id, msg.sender, token, proofHash, ipfsCid);
    }

    /// @notice Records a passed and reviewed proof: upgrades the coin to formal and pays the tier's reward. Anyone may
    /// relay it; the verifier bot's EIP-712 signature over (id, tier, deadline) is what authorises it.
    function markVerified(bytes32 id, Tier tier, uint256 deadline, bytes calldata signature) external nonReentrant {
        if (payoutsPaused) revert PayoutsPaused();
        if (block.timestamp > deadline) revert Expired();
        Submission storage s = _submissions[id];
        if (s.status != Status.Pending) revert NotPending();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VERIFY_TYPEHASH, id, uint8(tier), deadline)));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != verifierBot) revert BadSignature();

        uint256 reward = rewardAmount[tier];
        pendingFees -= s.feePaid; // the fee is the pool's now
        if (availableBalance() < reward + minPoolBalance) revert PoolDepleted();

        s.status = Status.Verified;
        s.tier = tier;
        s.reward = reward;
        emit Verified(id, tier, reward);
        rigorRegistry.upgradeToFormal(s.token);
        _send(s.submitter, reward);
    }

    /// @notice Records a proof that failed the checker (or the review). The fee stays in the pool.
    function markFailed(bytes32 id, string calldata reason) external {
        if (msg.sender != verifierBot) revert NotBot();
        Submission storage s = _submissions[id];
        if (s.status != Status.Pending) revert NotPending();
        s.status = Status.Failed;
        pendingFees -= s.feePaid;
        emit Failed(id, bytes(reason).length > MAX_REASON_LENGTH ? reason[:MAX_REASON_LENGTH] : reason);
    }

    /// @notice Owner: gives a pending submission's fee back (rollback); the same proof may be submitted again.
    function refund(bytes32 id) external nonReentrant onlyOwner {
        Submission storage s = _submissions[id];
        if (s.status != Status.Pending) revert NotPending();
        s.status = Status.Refunded;
        pendingFees -= s.feePaid;
        proofSubmitted[keccak256(abi.encode(s.token, s.proofHash))] = false;
        emit Refunded(id, s.feePaid);
        _send(s.submitter, s.feePaid);
    }

    /// @notice Withdraws a reward or refund that could not be sent when it was due.
    function claim() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        emit Claimed(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ── Views ────────────────────────────────────────────────────────────────────

    /// @notice The balance free for rewards: everything except pending fees and amounts owed.
    function availableBalance() public view returns (uint256) {
        uint256 held = pendingFees + totalOwed;
        return address(this).balance > held ? address(this).balance - held : 0;
    }

    function getSubmission(bytes32 id) external view returns (Submission memory) {
        return _submissions[id];
    }

    function userSubmissions(address submitter) external view returns (bytes32[] memory) {
        return _userSubmissions[submitter];
    }

    /// @notice The EIP-712 digest the verifier bot signs for markVerified.
    function verifyDigest(bytes32 id, Tier tier, uint256 deadline) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VERIFY_TYPEHASH, id, uint8(tier), deadline)));
    }

    // ── Admin ────────────────────────────────────────────────────────────────────

    /// @notice Emergency withdrawal: at most 20% of the available balance, at most once every 7 days.
    function withdrawExcess(uint256 amount) external nonReentrant onlyOwner {
        if (block.timestamp < lastWithdrawAt + WEEK) revert TooSoon();
        if (amount > (availableBalance() * MAX_WITHDRAW_BPS) / 10_000) revert TooMuch();
        lastWithdrawAt = block.timestamp;
        emit Withdrawn(owner(), amount);
        (bool ok,) = owner().call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function setRewardAmount(Tier tier, uint256 amount) external onlyOwner {
        rewardAmount[tier] = amount;
        emit RewardAmountSet(tier, amount);
    }

    function setSubmissionFee(uint256 fee) external onlyOwner {
        submissionFee = fee;
        emit SubmissionFeeSet(fee);
    }

    function setMinPoolBalance(uint256 amount) external onlyOwner {
        minPoolBalance = amount;
        emit MinPoolBalanceSet(amount);
    }

    function setMaxPerWeek(uint8 max) external onlyOwner {
        if (max == 0) revert BadInput();
        maxPerWeek = max;
        emit MaxPerWeekSet(max);
    }

    function setVerifierBot(address bot) external onlyOwner {
        if (bot == address(0)) revert ZeroAddress();
        verifierBot = bot;
        emit VerifierBotSet(bot);
    }

    function setRigorRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        rigorRegistry = IRigorRegistry(registry);
        emit RigorRegistrySet(registry);
    }

    function setSubmissionsPaused(bool paused) external onlyOwner {
        submissionsPaused = paused;
        emit SubmissionsPausedSet(paused);
    }

    /// @notice Rollback: stops payouts without touching the pool.
    function pausePayouts() external onlyOwner {
        payoutsPaused = true;
        emit PayoutsPausedSet(true);
    }

    function resumePayouts() external onlyOwner {
        payoutsPaused = false;
        emit PayoutsPausedSet(false);
    }

    // ── Internal ─────────────────────────────────────────────────────────────────

    /// @dev Pushes ETH; if the recipient can't take it, records it for claim() instead of failing the whole call.
    /// Gas-capped and copies no return data, so a hostile recipient can neither block nor bloat the call.
    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        bool ok;
        assembly ("memory-safe") {
            ok := call(50000, to, amount, 0, 0, 0, 0)
        }
        if (!ok) {
            owed[to] += amount;
            totalOwed += amount;
            emit Owed(to, amount); // after the failed call by necessity: it records that the call failed
        }
    }
}
