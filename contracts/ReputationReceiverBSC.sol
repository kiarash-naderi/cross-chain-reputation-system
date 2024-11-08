// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPReceiver.sol";

contract ReputationReceiverBSC is ICCIPReceiver, ERC20 {
    constructor() ERC20("ReputationTokenBSC", "REPBSC") {}

    function ccipReceive(
        uint64 _srcChainId,
        bytes memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external override {
        // Decode the payload
        (address to, uint256 amount) = abi.decode(_payload, (address, uint256));

        // Mint the reputation tokens to the recipient
        _mint(to, amount);
    }

    function ccipReceiveCustom(
        uint64 _srcChainId,
        bytes memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external override {
        revert("Unsupported function");
    }
}