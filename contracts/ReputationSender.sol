// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPSender.sol";

contract ReputationSender is ICCIPSender {
    IERC20 public reputationToken;

    constructor(address _reputationTokenAddress){
        reputationToken = IERC20(_reputationTokenAddress);
    }

    function sendReputation(
        address _to,
        uint256 _amount,
        uint64 _dstChainID,
        address _dstContract
    ) external{
        require(reputationToken.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        // Burn the reputation tokens
        reputationToken.transferFrom(msg.sender, address(this), _amount);

        // Emit the CCIP send event
        emit CCIPSendRequested(
            _dstChainID,
            _dstContract,
            abi.encode(_to, _amount),
            msg.sender,
            address(0),
            address(0),
            "",
            ""
        );
     
    }

    function ccipSendCallback(
        uint64 _dstChainID,
        address _dstContract,
        bytes memory _payload,
        address _refundAddress,
        address _ZroPaymentAddress,
        bytes memory _adapterParams
    ) external override {
        revert("Unsupported function");
    }
    
}

