// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPReceiver.sol";

contract ReputationReceiverETH is ICCIPReceiver , ERC20 {

    constructor() ERC20("ReputationTokenETH", "REPBSC") {}

    function ccipReceive(
        uint64 _srcChainID,
        bytes memory _srCAddress,
        address _dstAdress,
        uint64 _nonce,
        bytes memory _payload
    ) external override {
        // Decode the payload
        (address _from, uint256 _amount) = abi.decode(_payload, (address, uint256));
        
        // Mint the reputation tokens to the recipient
        _mint(to, amount);
    }

    function ccipReceiveCustom(
        uint64 _srcChainID,
        bytes  memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload,
    ) external override {
        revert("Unsupported function");
    }

}