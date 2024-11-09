// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.8/interfaces/ICCIPSender.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title ReputationSender
 * @dev A contract for sending reputation tokens across chains using CCIP.
 */
contract ReputationSender is ICCIPSender, Pausable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IERC20 public reputationToken;
    uint256 public decayFactor;
    uint256 public minReputationScore;

    mapping(uint64 => bool) public authorizedChains;
    mapping(uint64 => address) public feeOracles;

    struct UserActivity {
        uint256 transactionCount;
        uint256 participationLevel;
        uint256 lastActivityTimestamp;
        uint256 reputationScore;
    }

    mapping(address => UserActivity) public userActivities;

    // Events
    event ReputationSent(address indexed from, address indexed to, uint256 amount, uint64 dstChainId, address dstContract);
    event UserActivityRecorded(address indexed user, uint256 participationLevel, uint256 reputationScore);
    event ChainAuthorized(uint64 chainId);
    event ChainUnauthorized(uint64 chainId);
    event FeeOracleUpdated(uint64 chainId, address oracleAddress);
    event MinReputationScoreUpdated(uint256 minScore);
    event DecayFactorUpdated(uint256 newFactor);

    // Custom errors
    error InvalidDestinationAddress();
    error UnauthorizedChain();
    error InsufficientBalance();
    error InsufficientReputationScore();
    error InvalidFeeAmount();
    error UnauthorizedCaller();

    /**
     * @dev Constructor function.
     * @param _reputationTokenAddress The address of the reputation token contract.
     * @param _decayFactor The initial decay factor for reputation score.
     * @param _minReputationScore The minimum reputation score required for sending tokens.
     */
    constructor(
        address _reputationTokenAddress, 
        uint256 _decayFactor, 
        uint256 _minReputationScore
    ) {
        require(_reputationTokenAddress != address(0), "Invalid token address");
        reputationToken = IERC20(_reputationTokenAddress);
        decayFactor = _decayFactor;
        minReputationScore = _minReputationScore;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(OPERATOR_ROLE, msg.sender);
    }

    modifier onlyAuthorized() {
        if (!hasRole(OPERATOR_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedCaller();
        }
        _;
    }

    /**
     * @dev Sends reputation tokens to a destination chain and contract.
     */
    function sendReputation(
        address _to,
        uint256 _amount,
        uint64 _dstChainId,
        address _dstContract
    ) external payable nonReentrant whenNotPaused {
        // Input validation
        if (_to == address(0)) revert InvalidDestinationAddress();
        if (!authorizedChains[_dstChainId]) revert UnauthorizedChain();
        if (reputationToken.balanceOf(msg.sender) < _amount) revert InsufficientBalance();

        // Check reputation score with decay
        uint256 currentScore = calculateReputationScore(msg.sender);
        if (currentScore < minReputationScore) revert InsufficientReputationScore();

        // Calculate fees
        bytes memory payload = abi.encode(_to, _amount);
        uint256 fee = estimateFee(_dstChainId, _dstContract, payload);
        if (msg.value < fee) revert InvalidFeeAmount();

        // Record user activity and update reputation
        recordUserActivity(msg.sender, _amount);

        // Transfer tokens using SafeERC20
        reputationToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Emit CCIP events
        emitCCIPSendRequested(
            _dstChainId,
            _dstContract,
            payload,
            msg.sender
        );

        emit ReputationSent(msg.sender, _to, _amount, _dstChainId, _dstContract);
    }

    /**
     * @dev Records and updates user activity and reputation.
     */
    function recordUserActivity(address user, uint256 participationLevel) internal {
        UserActivity storage activity = userActivities[user];
        
        unchecked {
            activity.transactionCount++;
        }
        
        activity.participationLevel = participationLevel;
        activity.lastActivityTimestamp = block.timestamp;
        
        // Calculate and store new reputation score
        uint256 newScore = calculateReputationScore(user);
        activity.reputationScore = newScore;

        emit UserActivityRecorded(user, participationLevel, newScore);
    }

    /**
     * @dev Calculates reputation score with decay factor.
     */
    function calculateReputationScore(address user) public view returns (uint256) {
        UserActivity storage activity = userActivities[user];

        if (activity.lastActivityTimestamp == 0) {
            return 0;
        }

        unchecked {
            uint256 transactionCountScore = activity.transactionCount * 10;
            uint256 participationLevelScore = activity.participationLevel * 20;
            uint256 timeSinceLastActivity = block.timestamp - activity.lastActivityTimestamp;
            uint256 decayAmount = (timeSinceLastActivity * decayFactor) / 1 days;

            uint256 baseScore = transactionCountScore + participationLevelScore;
            return baseScore > decayAmount ? baseScore - decayAmount : 0;
        }
    }

    /**
     * @dev Estimates the fee for cross-chain message.
     */
    function estimateFee(
        uint64 _dstChainId, 
        address _dstContract, 
        bytes memory _payload
    ) public view returns (uint256 fee) {
        address feeOracle = feeOracles[_dstChainId];
        
        if (feeOracle != address(0)) {
            // Use oracle for fee calculation
            AggregatorV3Interface oracle = AggregatorV3Interface(feeOracle);
            (, int256 feeRate,,,) = oracle.latestRoundData();
            fee = uint256(feeRate) * _payload.length;
        } else {
            // Default fee calculation
            if (_dstChainId == 1) { // Ethereum Mainnet
                fee = 0.01 ether + (_payload.length * 100);
            } else if (_dstChainId == 56) { // BSC
                fee = 0.005 ether + (_payload.length * 50);
            } else {
                fee = 0.001 ether + (_payload.length * 10);
            }
        }
    }

    /**
     * @dev Emits CCIP send request event.
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

    // Admin functions with role-based access control
    
    function authorizeChain(uint64 _chainId) external onlyRole(ADMIN_ROLE) {
        authorizedChains[_chainId] = true;
        emit ChainAuthorized(_chainId);
    }

    function unauthorizeChain(uint64 _chainId) external onlyRole(ADMIN_ROLE) {
        authorizedChains[_chainId] = false;
        emit ChainUnauthorized(_chainId);
    }

    function setFeeOracle(uint64 _chainId, address _oracleAddress) external onlyRole(ADMIN_ROLE) {
        feeOracles[_chainId] = _oracleAddress;
        emit FeeOracleUpdated(_chainId, _oracleAddress);
    }

    function setMinReputationScore(uint256 _minScore) external onlyRole(ADMIN_ROLE) {
        minReputationScore = _minScore;
        emit MinReputationScoreUpdated(_minScore);
    }

    function setDecayFactor(uint256 _newFactor) external onlyRole(ADMIN_ROLE) {
        decayFactor = _newFactor;
        emit DecayFactorUpdated(_newFactor);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Custom CCIP send function (not implemented).
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

    /**
     * @dev Withdraw function for admin to recover stuck tokens
     */
    function withdrawToken(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyRole(ADMIN_ROLE) {
        require(_token != address(reputationToken), "Cannot withdraw reputation token");
        IERC20(_token).safeTransfer(_to, _amount);
    }

    /**
     * @dev Receive function for handling native token transfers
     */
    receive() external payable {}
}