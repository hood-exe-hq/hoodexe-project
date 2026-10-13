// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IRigorRegistry} from "./IRigorRegistry.sol";

/// @title hood.exe rigor registry
/// @notice The on-chain record of coins whose theorem has a formally verified (Lean 4) proof. AI rigor scores
/// (DeepSeek, Σ 0–100) stay off-chain in the API; only the formal upgrade to Σ 100 lives here, written by the
/// VerificationPool once a proof has passed the checker and the admin's review.
contract RigorRegistry is IRigorRegistry, Ownable2Step {
    /// @notice 100 for formally verified coins, 0 otherwise (AI scores are not stored on-chain).
    mapping(address token => uint8) public rigorScore;
    mapping(address token => bool) public isFormallyVerified;
    /// @notice The only address allowed to upgrade a coin.
    address public verificationPool;

    event VerificationPoolSet(address indexed pool);
    event FormalVerificationUpgrade(address indexed token);
    event FormalVerificationRevoked(address indexed token, string reason);

    error NotPool();
    error NotVerified();
    error ZeroAddress();

    constructor(address owner_) Ownable(owner_) {}

    function setVerificationPool(address pool) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        verificationPool = pool;
        emit VerificationPoolSet(pool);
    }

    /// @notice Marks a coin formally verified (Σ 100). Called by the VerificationPool in markVerified.
    function upgradeToFormal(address token) external {
        if (msg.sender != verificationPool) revert NotPool();
        rigorScore[token] = 100;
        isFormallyVerified[token] = true;
        emit FormalVerificationUpgrade(token);
    }

    /// @notice Takes the badge back if a verified proof turns out not to prove the coin's theorem.
    function revokeFormal(address token, string calldata reason) external onlyOwner {
        if (!isFormallyVerified[token]) revert NotVerified();
        rigorScore[token] = 0;
        isFormallyVerified[token] = false;
        emit FormalVerificationRevoked(token, reason);
    }
}
