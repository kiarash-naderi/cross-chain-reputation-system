// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPReceiver.sol";

/**
 * @title ReputationReceiverETH
 * @dev A contract for receiving reputation tokens on the Ethereum Sepolia network using CCIP.
 */
contract ReputationReceiverETH is ICCIPReceiver, ERC20, Pausable, ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    // Chain selectors
    uint64 public constant SEPOLIA_SELECTOR = 16015286601757825753;
    uint64 public constant BSC_TESTNET_SELECTOR = 13264668187771770619;
    uint64 public constant ZKSYNC_TESTNET_SELECTOR = 300;

    // Roles
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // State variables
    mapping(uint64 => bool) public authorizedChains;
    mapping(uint64 => mapping(address => bool)) public authorizedSenders;
    mapping(bytes32 => bool) public processedMessages;
    mapping(address => mapping(uint256 => uint256)) public dailyMintAmount; // user -> day -> amount
    
    uint256 public maxMintAmount;
    uint256 public dailyMintLimit;
    uint256 private constant TIMELOCK_PERIOD = 24 hours;
    mapping(bytes32 => uint256) private pendingOperations;
    mapping(uint64 => uint256) public chainGasLimits;

    // Events
    event ReputationReceived(
        address indexed from, 
        address indexed to, 
        uint256 amount,
        uint64 indexed srcChainId,
        string networkName
    );
    event ChainAuthorized(uint64 chainId, string networkName);
    event ChainUnauthorized(uint64 chainId, string networkName);
    event SenderAuthorized(uint64 chainId, address sender);
    event SenderUnauthorized(uint64 chainId, address sender);
    event MaxMintAmountUpdated(uint256 amount);
    event DailyLimitUpdated(uint256 amount);
    event ContractStatusChanged(bool isPaused);
    event TokensRecovered(address token, uint256 amount);
    event RecoveryProposed(bytes32 indexed operationId, address indexed token);
    event GasLimitUpdated(uint64 chainId, uint256 limit);

    // Custom errors
    error UnauthorizedChain();
    error InvalidSourceAddress();
    error UnauthorizedSender();
    error ExceedsMaxMintAmount();
    error ExceedsDailyLimit();
    error InvalidTokenAddress();
    error RecoveryFailed();
    error MessageAlreadyProcessed();
    error TimelockNotExpired();
    error InvalidAmount();
    error CannotRecoverReputationToken();
    error InvalidChainSelector();
    error InvalidGasLimit();

    /**
     * @dev Constructor function
     * @param _maxMintAmount The maximum amount of tokens that can be minted per transaction
     */
    constructor(uint256 _maxMintAmount) ERC20("ReputationTokenETH", "REPETH") {
        maxMintAmount = _maxMintAmount;
        dailyMintLimit = _maxMintAmount * 10; // Default daily limit is 10x max mint
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);

        // Initialize gas limits
        chainGasLimits[SEPOLIA_SELECTOR] = 200000;
        chainGasLimits[BSC_TESTNET_SELECTOR] = 150000;
        chainGasLimits[ZKSYNC_TESTNET_SELECTOR] = 100000;
    }

    /**
     * @dev Receives and processes cross-chain reputation transfer
     */
    function ccipReceive(
        uint64 _srcChainId,
        bytes memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external override whenNotPaused nonReentrant {
        // Chain and destination validation
        if (!authorizedChains[_srcChainId]) revert UnauthorizedChain();
        if (_dstAddress != address(this)) revert InvalidSourceAddress();
        if (chainGasLimits[_srcChainId] == 0) revert InvalidGasLimit();

        // Sender validation
        address sender = abi.decode(_srcAddress, (address));
        if (!authorizedSenders[_srcChainId][sender]) revert UnauthorizedSender();

        // Message deduplication check
        bytes32 messageId = keccak256(abi.encode(
            _srcChainId,
            sender,
            _nonce,
            _payload
        ));
        if (processedMessages[messageId]) revert MessageAlreadyProcessed();

        // Decode and validate payload
        (address to, uint256 amount) = abi.decode(_payload, (address, uint256));
        if (amount > maxMintAmount) revert ExceedsMaxMintAmount();
        if (amount == 0) revert InvalidAmount();

        // Check daily limit
        uint256 today = block.timestamp / 1 days;
        uint256 userDailyTotal = dailyMintAmount[to][today] + amount;
        if (userDailyTotal > dailyMintLimit) revert ExceedsDailyLimit();

        // Process message
        processedMessages[messageId] = true;
        dailyMintAmount[to][today] = userDailyTotal;
        _mint(to, amount);

        emit ReputationReceived(
            sender, 
            to, 
            amount, 
            _srcChainId,
            _getNetworkName(_srcChainId)
        );
    }

    /**
     * @dev Proposes a token recovery operation
     */
    function proposeRecovery(address token) external onlyRole(ADMIN_ROLE) {
        if (token == address(this)) revert CannotRecoverReputationToken();
        
        bytes32 operationId = keccak256(
            abi.encodePacked("recover", token, block.timestamp)
        );
        pendingOperations[operationId] = block.timestamp + TIMELOCK_PERIOD;
        
        emit RecoveryProposed(operationId, token);
    }

    function executeRecovery(
        bytes32 operationId,
        address token
    ) external onlyRole(ADMIN_ROLE) {
        if (block.timestamp < pendingOperations[operationId]) 
            revert TimelockNotExpired();

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert RecoveryFailed();

        IERC20(token).safeTransfer(msg.sender, balance);
        emit TokensRecovered(token, balance);
    }

    function ccipReceiveCustom(
        uint64 _srcChainId,
        bytes memory _srcAddress,
        address _dstAddress,
        uint64 _nonce,
        bytes memory _payload
    ) external pure override {
        revert("Unsupported function");
    }

    // Admin functions

    function authorizeChain(uint64 _chainId) external onlyRole(ADMIN_ROLE) {
        if (_chainId != SEPOLIA_SELECTOR && 
            _chainId != BSC_TESTNET_SELECTOR && 
            _chainId != ZKSYNC_TESTNET_SELECTOR) {
            revert InvalidChainSelector();
        }
        authorizedChains[_chainId] = true;
        emit ChainAuthorized(_chainId, _getNetworkName(_chainId));
    }

    function unauthorizeChain(uint64 _chainId) external onlyRole(ADMIN_ROLE) {
        authorizedChains[_chainId] = false;
        emit ChainUnauthorized(_chainId, _getNetworkName(_chainId));
    }

    function authorizeSender(
        uint64 _chainId,
        address _sender
    ) external onlyRole(ADMIN_ROLE) {
        authorizedSenders[_chainId][_sender] = true;
        emit SenderAuthorized(_chainId, _sender);
    }

    function unauthorizeSender(
        uint64 _chainId,
        address _sender
    ) external onlyRole(ADMIN_ROLE) {
        authorizedSenders[_chainId][_sender] = false;
        emit SenderUnauthorized(_chainId, _sender);
    }

    function setMaxMintAmount(uint256 _amount) external onlyRole(ADMIN_ROLE) {
        maxMintAmount = _amount;
        emit MaxMintAmountUpdated(_amount);
    }

    function setDailyMintLimit(uint256 _limit) external onlyRole(ADMIN_ROLE) {
        dailyMintLimit = _limit;
        emit DailyLimitUpdated(_limit);
    }

    function updateGasLimit(
        uint64 _chainId, 
        uint256 _limit
    ) external onlyRole(ADMIN_ROLE) {
        if (_chainId != SEPOLIA_SELECTOR && 
            _chainId != BSC_TESTNET_SELECTOR && 
            _chainId != ZKSYNC_TESTNET_SELECTOR) {
            revert InvalidChainSelector();
        }
        chainGasLimits[_chainId] = _limit;
        emit GasLimitUpdated(_chainId, _limit);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
        emit ContractStatusChanged(true);
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
        emit ContractStatusChanged(false);
    }

    // View functions

    function isChainAuthorized(uint64 _chainId) external view returns (bool) {
        return authorizedChains[_chainId];
    }

    function isSenderAuthorized(
        uint64 _chainId,
        address _sender
    ) external view returns (bool) {
        return authorizedSenders[_chainId][_sender];
    }

    function isMessageProcessed(bytes32 messageId) external view returns (bool) {
        return processedMessages[messageId];
    }

    function getRecoveryTimelock(
        bytes32 operationId
    ) external view returns (uint256) {
        return pendingOperations[operationId];
    }

    function getDailyMintAmount(
        address user
    ) external view returns (uint256) {
        return dailyMintAmount[user][block.timestamp / 1 days];
    }

    // Helper functions
    function _getNetworkName(
        uint64 chainId
    ) internal pure returns (string memory) {
        if (chainId == SEPOLIA_SELECTOR) return "Sepolia";
        if (chainId == BSC_TESTNET_SELECTOR) return "BSC Testnet";
        if (chainId == ZKSYNC_TESTNET_SELECTOR) return "zkSync Testnet";
        return "Unknown";
    }
}