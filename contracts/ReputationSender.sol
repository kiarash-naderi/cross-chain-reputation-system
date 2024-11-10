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

    // Chain selectors for each network
    uint64 public constant SEPOLIA_SELECTOR = 16015286601757825753;
    uint64 public constant BSC_TESTNET_SELECTOR = 13264668187771770619;
    uint64 public constant ZKSYNC_TESTNET_SELECTOR = 300;

    // Roles
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // State variables
    IERC20 public reputationToken;
    uint256 public decayFactor;
    uint256 public minReputationScore;

    // Network specific settings
    mapping(uint64 => bool) public authorizedChains;
    mapping(uint64 => address) public feeOracles;
    mapping(uint64 => uint256) public chainGasLimits;

    struct UserActivity {
        uint256 transactionCount;
        uint256 participationLevel;
        uint256 lastActivityTimestamp;
        uint256 reputationScore;
        mapping(uint64 => uint256) chainTransfers; // Track transfers per chain
    }

    mapping(address => UserActivity) public userActivities;
    mapping(uint64 => uint256) public dailyTransferLimits;

    // Events
    event ReputationSent(
        address indexed from, 
        address indexed to, 
        uint256 amount, 
        uint64 indexed dstChainId, 
        address dstContract,
        string networkName
    );
    event UserActivityRecorded(
        address indexed user, 
        uint256 participationLevel, 
        uint256 reputationScore,
        string networkName
    );
    event ChainAuthorized(uint64 chainId, string networkName);
    event ChainUnauthorized(uint64 chainId, string networkName);
    event FeeOracleUpdated(uint64 chainId, address oracleAddress);
    event ChainGasLimitUpdated(uint64 chainId, uint256 gasLimit);
    event DailyLimitUpdated(uint64 chainId, uint256 limit);
    event NetworkSpecificEvent(
        uint64 indexed chainId,
        string networkName,
        uint256 gasLimit,
        uint256 estimatedFee
    );

    // Custom errors
    error InvalidDestinationAddress();
    error UnauthorizedChain();
    error InsufficientBalance();
    error InsufficientReputationScore();
    error InvalidFeeAmount();
    error UnauthorizedCaller();
    error InvalidChainSelector();
    error InvalidGasLimit();
    error DailyLimitExceeded();
    error InvalidNetworkParameters();

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

        // Initialize network parameters
        chainGasLimits[SEPOLIA_SELECTOR] = 200000;
        chainGasLimits[BSC_TESTNET_SELECTOR] = 150000;
        chainGasLimits[ZKSYNC_TESTNET_SELECTOR] = 100000;

        // Set default daily limits
        dailyTransferLimits[SEPOLIA_SELECTOR] = 1000 * 10**18;
        dailyTransferLimits[BSC_TESTNET_SELECTOR] = 1000 * 10**18;
        dailyTransferLimits[ZKSYNC_TESTNET_SELECTOR] = 1000 * 10**18;
    }

    modifier onlyAuthorized() {
        if (!hasRole(OPERATOR_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier validChainSelector(uint64 chainId) {
        if (chainId != SEPOLIA_SELECTOR && 
            chainId != BSC_TESTNET_SELECTOR && 
            chainId != ZKSYNC_TESTNET_SELECTOR) {
            revert InvalidChainSelector();
        }
        _;
    }

    /**
     * @dev Sends reputation tokens cross-chain
     */
    function sendReputation(
        address _to,
        uint256 _amount,
        uint64 _dstChainId,
        address _dstContract
    ) external payable nonReentrant whenNotPaused validChainSelector(_dstChainId) {
        // Input validation
        if (_to == address(0)) revert InvalidDestinationAddress();
        if (!authorizedChains[_dstChainId]) revert UnauthorizedChain();
        if (reputationToken.balanceOf(msg.sender) < _amount) revert InsufficientBalance();

        // Check daily limits
        UserActivity storage activity = userActivities[msg.sender];
        uint256 todayTransfers = activity.chainTransfers[_dstChainId];
        if (todayTransfers + _amount > dailyTransferLimits[_dstChainId]) {
            revert DailyLimitExceeded();
        }

        // Get network specific gas limit
        uint256 gasLimit = chainGasLimits[_dstChainId];
        if (gasLimit == 0) revert InvalidGasLimit();

        // Calculate fees
        bytes memory payload = abi.encode(_to, _amount);
        uint256 fee = estimateFee(_dstChainId, _dstContract, payload);
        if (msg.value < fee) revert InvalidFeeAmount();

        // Update state
        activity.chainTransfers[_dstChainId] += _amount;
        recordUserActivity(msg.sender, _amount, _dstChainId);

        // Transfer tokens
        reputationToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Emit CCIP and custom events
        emitCCIPSendRequested(_dstChainId, _dstContract, payload, msg.sender);
        
        emit ReputationSent(
            msg.sender, 
            _to, 
            _amount, 
            _dstChainId, 
            _dstContract,
            _getNetworkName(_dstChainId)
        );

        emit NetworkSpecificEvent(
            _dstChainId,
            _getNetworkName(_dstChainId),
            gasLimit,
            fee
        );
    }

    function estimateFee(
        uint64 _dstChainId, 
        address _dstContract, 
        bytes memory _payload
    ) public view validChainSelector(_dstChainId) returns (uint256 fee) {
        address feeOracle = feeOracles[_dstChainId];
        
        if (feeOracle != address(0)) {
            AggregatorV3Interface oracle = AggregatorV3Interface(feeOracle);
            (, int256 feeRate,,,) = oracle.latestRoundData();
            fee = uint256(feeRate) * _payload.length;
        } else {
            if (_dstChainId == SEPOLIA_SELECTOR) {
                fee = 0.01 ether + (_payload.length * 100);
            } else if (_dstChainId == BSC_TESTNET_SELECTOR) {
                fee = 0.005 ether + (_payload.length * 50);
            } else if (_dstChainId == ZKSYNC_TESTNET_SELECTOR) {
                fee = 0.001 ether + (_payload.length * 30);
            }
        }
    }

    function recordUserActivity(
        address user, 
        uint256 participationLevel, 
        uint64 chainId
    ) internal {
        UserActivity storage activity = userActivities[user];
        
        unchecked {
            activity.transactionCount++;
        }
        
        activity.participationLevel = participationLevel;
        activity.lastActivityTimestamp = block.timestamp;
        
        uint256 newScore = calculateReputationScore(user);
        activity.reputationScore = newScore;

        emit UserActivityRecorded(
            user, 
            participationLevel, 
            newScore,
            _getNetworkName(chainId)
        );
    }

    function calculateReputationScore(address user) public view returns (uint256) {
        UserActivity storage activity = userActivities[user];

        if (activity.lastActivityTimestamp == 0) {
            return 0;
        }

        unchecked {
            uint256 baseScore = activity.transactionCount * 10 + 
                              activity.participationLevel * 20;
            
            uint256 timeSinceLastActivity = block.timestamp - activity.lastActivityTimestamp;
            uint256 decayAmount = (timeSinceLastActivity * decayFactor) / 1 days;

            return baseScore > decayAmount ? baseScore - decayAmount : 0;
        }
    }

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

    // Admin functions
    function updateChainGasLimit(
        uint64 _chainId, 
        uint256 _gasLimit
    ) external onlyRole(ADMIN_ROLE) validChainSelector(_chainId) {
        chainGasLimits[_chainId] = _gasLimit;
        emit ChainGasLimitUpdated(_chainId, _gasLimit);
    }

    function updateDailyLimit(
        uint64 _chainId, 
        uint256 _limit
    ) external onlyRole(ADMIN_ROLE) validChainSelector(_chainId) {
        dailyTransferLimits[_chainId] = _limit;
        emit DailyLimitUpdated(_chainId, _limit);
    }

    function authorizeChain(uint64 _chainId) external onlyRole(ADMIN_ROLE) validChainSelector(_chainId) {
        authorizedChains[_chainId] = true;
        emit ChainAuthorized(_chainId, _getNetworkName(_chainId));
    }

    function unauthorizeChain(uint64 _chainId) external onlyRole(ADMIN_ROLE) validChainSelector(_chainId) {
        authorizedChains[_chainId] = false;
        emit ChainUnauthorized(_chainId, _getNetworkName(_chainId));
    }

    function setFeeOracle(
        uint64 _chainId, 
        address _oracleAddress
    ) external onlyRole(ADMIN_ROLE) validChainSelector(_chainId) {
        feeOracles[_chainId] = _oracleAddress;
        emit FeeOracleUpdated(_chainId, _oracleAddress);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
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

    receive() external payable {}
}