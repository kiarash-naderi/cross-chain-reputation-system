// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ICCIPInterface {
    function cciSend(
        uint64 _dstChainID,
        address _dstContract,
        bytes calldata _payload,
        address _refundAddress,
        address _ZroPaymentAddress,
        bytes calldata _adapterParams
    ) external;

    function cciReceive(
        uint64 _srcChainID,
        bytes calldata _srcContract,
        address _dstContract,
        uint64 _nonce,
        bytes calldata _payload
    ) external;
}