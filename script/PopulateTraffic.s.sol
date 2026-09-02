// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {SoldBackrunHook} from "../src/SoldBackrunHook.sol";
import {SearcherBond} from "../src/SearcherBond.sol";
import {BackrunAgent} from "../src/BackrunAgent.sol";

contract PopulateTrafficScript is Script {
    function run() public {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        string memory j = vm.readFile("frontend/src/deployed.json");
        address hook = vm.parseJsonAddress(j, ".hook");
        address bonds = vm.parseJsonAddress(j, ".bonds");
        address router = vm.parseJsonAddress(j, ".swapRouter");
        address token0 = vm.parseJsonAddress(j, ".token0");
        address token1 = vm.parseJsonAddress(j, ".token1");

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hook)
        });

        vm.startBroadcast(pk);
        BackrunAgent agent = new BackrunAgent(
            IUniswapV4Router04(payable(router)),
            SoldBackrunHook(hook),
            SearcherBond(bonds),
            IERC20(token0),
            IERC20(token1),
            key
        );
        agent.arm(80_000 ether);
        agent.huntMany(4, 0.05 ether, 0.04 ether, 3 ether);
        agent.huntMany(4, 0.08 ether, 0.06 ether, 5 ether);
        agent.hunt(true, 0.03 ether, 0.02 ether, 2 ether);
        agent.hunt(false, 0.04 ether, 0.03 ether, 4 ether);
        vm.stopBroadcast();

        console2.log("BackrunAgent", address(agent));
    }
}
