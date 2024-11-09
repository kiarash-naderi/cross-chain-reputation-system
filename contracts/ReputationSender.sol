// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPSender.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title ReputationSender
 * @dev A contract for sending reputation tokens across chains using CCIP.
 */
contract ReputationSender is ICCIPSender, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public reputationToken;
    uint256 public decayFactor;
    uint256 public minReputationScore;

    mapping(uint64 => bool) public authorizedChains;
    mapping(uint64 => address) public feeOracles;

    struct UserActivity {
        uint256 transactionCount;
        uint256 participationLevel;
        uint256 lastActivityTimestamp;
    }

    mapping(address => UserActivity) public userActivities;

    event ReputationSent(address indexed from, address indexed to, uint256 amount, uint64 dstChainId, address dstContract);
    event UserActivityRecorded(address indexed user, uint256 participationLevel);
    event ChainAuthorized(uint64 chainId);
    event ChainUnauthorized(uint64 chainId);
    event FeeOracleUpdated(uint64 chainId, address oracleAddress);
    event MinReputationScoreUpdated(uint256 minScore);

    error InvalidDestinationAddress();
    error UnauthorizedChain();
    error InsufficientBalance();
    error InsufficientReputationScore();

    /**
     * @dev Constructor function.
     * @param _reputationTokenAddress The address of the reputation token contract.
     * @param _decayFactor The initial decay factor for reputation score.
     * @param _minReputationScore The minimum reputation score required for sending tokens.
     */
    constructor(address _reputationTokenAddress, uint256 _decayFactor, uint256 _minReputationScore) {
        require(_reputationTokenAddress != address(0), "Invalid token address");
        reputationToken = IERC20(_reputationTokenAddress);
        decayFactor = _decayFactor;
        minReputationScore = _minReputationScore;
    }

    /**
     * @dev Sends reputation tokens to a destination chain and contract.
     * @param _to The recipient address on the destination chain.
     * @param _amount The amount of tokens to send.
     * @param _dstChainId The ID of the destination chain.
     * @param _dstContract The address of the destination contract.
     * @notice The destination chain must be authorized, and the recipient address must be valid.
     * @notice The sender must have a sufficient balance and reputation score to cover the transfer amount.
     */
    function sendReputation(
        address _to,
        uint256 _amount,
        uint64 _dstChainId,
        address _dstContract
    ) external whenNotPaused {
        if (_to == address(0)) {
            revert InvalidDestinationAddress();
        }
        if (!authorizedChains[_dstChainId]) {
            revert UnauthorizedChain();
        }
        if (reputationToken.balanceOf(msg.sender) < _amount) {
            revert InsufficientBalance();
        }
        if (calculateReputationScore(msg.sender) < minReputationScore) {
            revert InsufficientReputationScore();
        }

        // Record user activity
        recordUserActivity(msg.sender, _amount);

        // Burn the reputation tokens by transferring to the zero address
        reputationToken.safeTransfer(address(0), _amount);

        // Emit the CCIP send event
        emitCCIPSendRequested(_dstChainId, _dstContract, abi.encode(_to, _amount), msg.sender);

        emit ReputationSent(msg.sender, _to, _amount, _dstChainId, _dstContract);
    }

    /**
     * @dev Records user activity.
     * @param user The address of the user.
     * @param participationLevel The participation level of the user.
     */
    function recordUserActivity(address user, uint256 participationLevel) internal {
        UserActivity storage activity = userActivities[user];
        unchecked {
            activity.transactionCount++;
        }
        activity.participationLevel = participationLevel;
        activity.lastActivityTimestamp = block.timestamp;

        emit UserActivityRecorded(user, participationLevel);
    }

    /**
     * @dev Calculates the reputation score of a user.
     * @param user The address of the user.
     * @return reputationScore The calculated reputation score of the user.
     * @notice The reputation score is calculated based on transaction count, participation level, and last activity timestamp.
     * @notice The decay factor is applied to gradually reduce the score based on inactivity.
     */
    function calculateReputationScore(address user) public view returns (uint256 reputationScore) {
        UserActivity storage activity = userActivities[user];

        unchecked {
            uint256 transactionCountScore = activity.transactionCount * 10;
            uint256 participationLevelScore = activity.participationLevel * 20;
            uint256 lastActivityScore = (block.timestamp - activity.lastActivityTimestamp) * decayFactor / 86400;

            reputationScore = transactionCountScore + participationLevelScore - lastActivityScore;
        }
    }

    /**
     * @dev Estimates the fee for a CCIP send request.
     * @param _dstChainId The ID of the destination chain.
     * @param _dstContract The address of the destination contract.
     * @param _payload The payload to send.
     * @return fee The estimated fee for the CCIP send request.
     * @notice The fee estimation logic takes into account the destination chain, contract, and payload size.
     * @notice If a fee oracle is set for the destination chain, it will be used for more accurate fee estimation.
     */
    function estimateFee(uint64 _dstChainId, address _dstContract, bytes memory _payload) public view returns (uint256 fee) {
        address feeOracle = feeOracles[_dstChainId];
        if (feeOracle != address(0)) {
            // Use the fee oracle for the destination chain
            AggregatorV3Interface oracle = AggregatorV3Interface(feeOracle);
            (, int256 feeRate, , , ) = oracle.latestRoundData();
            fee = uint256(feeRate) * _payload.length;
        } else {
            // Fee estimation logic based on destination chain, contract, and payload size
            if (_dstChainId == 1) {
                // Ethereum Mainnet
                fee = 0.01 ether + (_payload.length * 100);
            } else if (_dstChainId == 56) {
                // Binance Smart Chain
                fee = 0.005 ether + (_payload.length * 50);
            } else {
                // Default fee for other chains
                fee = 0.001 ether + (_payload.length * 10);
            }
        }
    }

    /**
     * @dev Emits the CCIPSendRequested event.
     * @param _dstChainId The ID of the destination chain.
     * @param _dstContract The address of the destination contract.
     * @param _payload The payload to send.
     * @param _refundAddress The address to receive refunds.
     */
    function emitCCIPSendRequested(
        uint64 _dstChainId,
        address _dstContract,
        bytes memory _payload,
        address _refundAddress
    ) internal {
        emit CCIPSendRequested(
            _dstChainId,
            _dstContract,
            _payload,
            _refundAddress,
            address(0),
            address(0),
            "",
            ""
        );
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
     * @dev Sets the fee oracle for a specific chain.
     * @param _chainId The ID of the chain.
     * @param _oracleAddress The address of the fee oracle.
     * @notice Only the contract owner can set the fee oracle.
     */
    function setFeeOracle(uint64 _chainId, address _oracleAddress) external onlyOwner {
        feeOracles[_chainId] = _oracleAddress;
        emit FeeOracleUpdated(_chainId, _oracleAddress);
    }

    /**
     * @dev Sets the minimum reputation score required for sending tokens.
     * @param _minScore The minimum reputation score.
     * @notice Only the contract owner can set the minimum reputation score.
     */
    function setMinReputationScore(uint256 _minScore) external onlyOwner {
        minReputationScore = _minScore;
        emit MinReputationScoreUpdated(_minScore);
    }

    /**
     * @dev Pauses the contract.
     * @notice Only the contract owner can pause the contract.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpauses the contract.
     * @notice Only the contract owner can unpause the contract.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Custom CCIP send function (not supported in this contract).
     */
    function ccipSendCustom(
        uint64 _dstChainId,
        address _dstContract,
        bytes memory _payload,
        address _refundAddress,
        address _zroPaymentAddress,
        bytes memory _adapterParams
    ) external override {
        revert("Unsupported function");
    }
}