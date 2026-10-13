// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {FeeSplitter} from "../src/FeeSplitter.sol";
import {RigorRegistry} from "../src/RigorRegistry.sol";
import {VerificationPool} from "../src/VerificationPool.sol";

/// Deploys RigorRegistry, VerificationPool and FeeSplitter and wires them together (brief §3.4).
/// Local fork only until the contracts are reviewed:
///   OWNER=0x… VERIFIER_BOT=0x… OPERATOR=0x… forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
///     --broadcast --private-key <deployer key>
/// The deployer must be OWNER so it can wire the registry; hand ownership to a multisig afterwards (two-step).
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER");
        address bot = vm.envAddress("VERIFIER_BOT");
        address payable operator = payable(vm.envAddress("OPERATOR"));

        vm.startBroadcast();
        RigorRegistry registry = new RigorRegistry(owner);
        VerificationPool pool = new VerificationPool(owner, bot, address(registry));
        registry.setVerificationPool(address(pool));
        FeeSplitter splitter = new FeeSplitter(owner, operator, payable(address(pool)));
        vm.stopBroadcast();

        console.log("RIGOR_REGISTRY_ADDRESS=%s", address(registry));
        console.log("VERIFICATION_POOL_ADDRESS=%s", address(pool));
        console.log("FEE_SPLITTER_ADDRESS=%s", address(splitter));
    }
}
