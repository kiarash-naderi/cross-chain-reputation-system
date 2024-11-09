// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPReceiver.sol";

/**
 * @title ReputationReceiverETH
 * @dev A contract for receiving reputation tokens on the Ethereum Sepolia network using CCIP.
 */
contract ReputationReceiverETH is ICCIPReceiver, ERC20, Pausable, ReentrancyGuard, Ownable {
    mapping(uint64 => bool) public authorizedChains;
    mapping(uint64 => mapping(address => bool)) public authorizedSenders;
    uint256 public maxMintAmount;

    event ReputationReceived(address indexed from, address indexed to, uint256 amount);
    event ChainAuthorized(uint64 chainId);
    event ChainUnauthorized(uint64 chainId);
    event SenderAuthorized(uint64 chainId, address sender);
    event SenderUnauthorized(uint64 chainId, address sender);
    event MaxMintAmountUpdated(uint256 amount);
    event ContractStatusChanged(bool isPaused);
    event TokensRecovered(address token, uint256 amount);

    error UnauthorizedChain();
    error InvalidSourceAddress();
    error UnauthorizedSender();
    error ExceedsMaxMintAmount();
    error InvalidTokenAddress();
    error RecoveryFailed();

    /**
     * @dev Constructor function.
     * @param _maxMintAmount The maximum amount of tokens that can be minted per transaction.
     */
    constructor(uint256 _maxMintAmount) ERC20("ReputationTokenETH", "REPETH") {
        maxMintAmount = _maxMintAmount;
    }

    /**
     * @dev Receives and processes the cross-chain reputation transfer.
     * @param _srcChainId The ID of the source chain.
     * @param _srcAddress The address of the source contract.
     * @param _dstAddress The address of the destination contract.
     * @param _nonce The unique nonce for the cross-chain request.
     * @param _payload The payload data containing the recipient address and amount.
     * @notice Only authorized chains and senders can send reputation to this contract.
     * @notice The contract must not be paused.
     * @notice The amount to mint must not exceed the maximum allowed per transaction.
     */
    function ccipReceive(
        uint64 _srcChainId,
        bytes memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external override whenNotPaused nonReentrant {
        if (!authorizedChains[_srcChainId]) {
            revert UnauthorizedChain();
        }

        if (_dstAddress != address(this)) {
            revert InvalidSourceAddress();
        }

        address sender = abi.decode(_srcAddress, (address));
        if (!authorizedSenders[_srcChainId][sender]) {
            revert UnauthorizedSender();
        }

        // Decode the payload
        (address to, uint256 amount) = abi.decode(_payload, (address, uint256));

        if (amount > maxMintAmount) {
            revert ExceedsMaxMintAmount();
        }

        // Mint the reputation tokens to the recipient
        _mint(to, amount);

        emit ReputationReceived(sender, to, amount);
    }

    /**
     * @dev Custom CCIP receive function (not supported in this contract).
     */
    function ccipReceiveCustom(
        uint64 _srcChainId,
        bytes memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external override {
        revert("Unsupported function");
    }

    /**
     * @dev Authorizes a chain for cross-chain reputation transfers.
     * @param _chainId The ID of the chain to authorize.
     * @notice Only the contract owner can authorize a chain.
     */
    function authorizeChain(uint64 _chainId) external onlyOwner {
        authorizedChains[_chainId] = true;
        emit ChainAuthorized(_chainId);
    }

    /**
     * @dev Unauthorizes a chain for cross-chain reputation transfers.
     * @param _chainId The ID of the chain to unauthorize.
     * @notice Only the contract owner can unauthorize a chain.
     */
    function unauthorizeChain(uint64 _chainId) external onlyOwner {
        authorizedChains[_chainId] = false;
        emit ChainUnauthorized(_chainId);
    }

    /**
     * @dev Authorizes a sender address for a specific chain.
     * @param _chainId The ID of the chain.
     * @param _sender The address of the sender to authorize.
     * @notice Only the contract owner can authorize a sender.
     */
    function authorizeSender(uint64 _chainId, address _sender) external onlyOwner {
        authorizedSenders[_chainId][_sender] = true;
        emit SenderAuthorized(_chainId, _sender);
    }

    /**
     * @dev Unauthorizes a sender address for a specific chain.
     * @param _chainId The ID of the chain.
     * @param _sender The address of the sender to unauthorize.
     * @notice Only the contract owner can unauthorize a sender.
     */
    function unauthorizeSender(uint64 _chainId, address _sender) external onlyOwner {
        authorizedSenders[_chainId][_sender] = false;
        emit SenderUnauthorized(_chainId, _sender);
    }

    /**
     * @dev Sets the maximum amount of tokens that can be minted per transaction.
     * @param _amount The maximum mint amount.
     * @notice Only the contract owner can set the maximum mint amount.
     */
    function setMaxMintAmount(uint256 _amount) external onlyOwner {
        maxMintAmount = _amount;
        emit MaxMintAmountUpdated(_amount);
    }

    /**
     * @dev Checks if a chain is authorized for cross-chain reputation transfers.
     * @param _chainId The ID of the chain to check.
     * @return bool Returns true if the chain is authorized, false otherwise.
     */
    function isChainAuthorized(uint64 _chainId) external view returns (bool) {
        return authorizedChains[_chainId];
    }

    /**
     * @dev Checks if a sender is authorized for a specific chain
     * @param _chainId The chain ID to check
     * @param _sender The sender address to check
     * @return bool Returns true if the sender is authorized
     */
    function isSenderAuthorized(uint64 _chainId, address _sender) external view returns (bool) {
        return authorizedSenders[_chainId][_sender];
    }

    /**
     * @dev Recovers tokens accidentally sent to the contract
     * @param _token The token contract address
     * @notice Only owner can recover tokens
     */
    function recoverTokens(address _token) external onlyOwner {
        if (_token == address(this)) {
            revert InvalidTokenAddress();
        }
        
        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        
        if (balance == 0) {
            revert RecoveryFailed();
        }

        bool success = token.transfer(owner(), balance);
        if (!success) {
            revert RecoveryFailed();
        }

        emit TokensRecovered(_token, balance);
    }

    /**
     * @dev Pauses the contract.
     * @notice Only the contract owner can pause the contract.
     */
    function pause() external onlyOwner {
        _pause();
        emit ContractStatusChanged(true);
    }

    /**
     * @dev Unpauses the contract.
     * @notice Only the contract owner can unpause the contract.
     */
    function unpause() external onlyOwner {
        _unpause();
        emit ContractStatusChanged(false);
    }
}