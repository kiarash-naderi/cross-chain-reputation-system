// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ICCIPInterface
 * @dev Enhanced Interface for Cross-Chain Interoperability Protocol (CCIP) functionality
 * @notice This interface provides comprehensive cross-chain messaging capabilities
 * with advanced validation, fee management, and monitoring features
 */
interface ICCIPInterface {
    /**
     * @dev Fee configuration for cross-chain messages
     * @param baseFee Base fee for the message
     * @param gasPrice Gas price on the destination chain
     * @param multiplier Fee multiplier based on priority
     * @param extraFee Additional fees for special handling
     */
    struct FeeConfig {
        uint256 baseFee;
        uint256 gasPrice;
        uint256 multiplier;
        uint256 extraFee;
    }

    /**
     * @dev Validation parameters for message processing
     * @param minGasLimit Minimum gas required for processing
     * @param maxGasLimit Maximum gas allowed for processing
     * @param minTimeout Minimum timeout period
     * @param maxTimeout Maximum timeout period
     * @param maxRetries Maximum number of retry attempts
     */
    struct ValidationConfig {
        uint256 minGasLimit;
        uint256 maxGasLimit;
        uint256 minTimeout;
        uint256 maxTimeout;
        uint256 maxRetries;
    }

    /**
     * @dev Extended message structure with validation and fee details
     */
    struct CCIPMessage {
        // Basic message info
        uint64 sourceChainId;
        uint64 destinationChainId;
        address sender;
        address receiver;
        bytes data;
        
        // Gas and execution settings
        uint256 gasLimit;
        uint8 priority;
        uint256 validUntil;
        
        // Processing control
        uint256 retryCount;
        bool isCancellable;
        
        // Fee management
        FeeConfig feeConfig;
        
        // Validation
        ValidationConfig validationConfig;
        
        // Additional metadata
        bytes32 referenceId;      // For message correlation
        uint256 nonce;            // For message ordering
        mapping(string => bytes) extraData;  // For extensibility
    }

    // Extended Events
    event FeeConfigUpdated(
        uint64 indexed chainId,
        uint256 baseFee,
        uint256 multiplier
    );

    event ValidationConfigUpdated(
        uint64 indexed chainId,
        uint256 minGasLimit,
        uint256 maxGasLimit
    );

    event MessageValidationFailed(
        bytes32 indexed messageId,
        string reason
    );

    event FeeProcessed(
        bytes32 indexed messageId,
        uint256 feeAmount,
        address payer
    );

    // Additional Custom Errors
    error InvalidFeeConfig();
    error InvalidValidationConfig();
    error InsufficientGasLimit();
    error ExcessiveGasLimit();
    error InvalidTimeout();
    error InvalidNonce();
    error DuplicateMessage();

    /**
     * @dev Sends a message with comprehensive validation and fee calculation
     * @param message The complete message struct with all parameters
     * @return messageId The unique identifier for the message
     * @return fee The calculated fee for the message
     * Requirements:
     * - All validation parameters must be within configured limits
     * - Sufficient fee must be provided
     * - Message must pass all validation checks
     */
    function sendMessage(CCIPMessage calldata message)
        external
        payable
        returns (bytes32 messageId, uint256 fee);

    /**
     * @dev Updates fee configuration for a specific chain
     * @param chainId The chain ID to update
     * @param feeConfig New fee configuration
     * Requirements:
     * - Caller must have admin rights
     * - Fee parameters must be within allowed ranges
     */
    function updateFeeConfig(
        uint64 chainId,
        FeeConfig calldata feeConfig
    ) external;

    /**
     * @dev Updates validation configuration for a specific chain
     * @param chainId The chain ID to update
     * @param validationConfig New validation configuration
     * Requirements:
     * - Caller must have admin rights
     * - Validation parameters must be logical
     */
    function updateValidationConfig(
        uint64 chainId,
        ValidationConfig calldata validationConfig
    ) external;

    /**
     * @dev Calculates detailed fee breakdown for a message
     * @param message The message to calculate fees for
     * @return baseFee Base fee component
     * @return priorityFee Additional fee based on priority
     * @return gasFee Gas cost component
     * @return totalFee Total fee required
     */
    function calculateDetailedFee(CCIPMessage calldata message)
        external
        view
        returns (
            uint256 baseFee,
            uint256 priorityFee,
            uint256 gasFee,
            uint256 totalFee
        );

    /**
     * @dev Validates a message before processing
     * @param message The message to validate
     * @return isValid Whether the message passes all validation checks
     * @return failureReason Reason for validation failure if any
     */
    function validateMessage(CCIPMessage calldata message)
        external
        view
        returns (bool isValid, string memory failureReason);

    /**
     * @dev Gets the current fee configuration for a chain
     * @param chainId The chain ID to query
     * @return config The current fee configuration
     */
    function getFeeConfig(uint64 chainId)
        external
        view
        returns (FeeConfig memory config);

    /**
     * @dev Gets the current validation configuration for a chain
     * @param chainId The chain ID to query
     * @return config The current validation configuration
     */
    function getValidationConfig(uint64 chainId)
        external
        view
        returns (ValidationConfig memory config);

    // Previous functions with improved documentation...
    // (keep all previous functions but add detailed documentation)
}