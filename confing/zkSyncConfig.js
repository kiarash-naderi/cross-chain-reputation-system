const { ethers } = require("hardhat");

module.exports = {
    chainSelector: "16015286601757825753", // zksync sepolia chain selector
    ccipRouter: "0xD0daae2231E9CB96b94C8512223533293C3693Bf", // zksync sepolia CCIP router
    reputationToken: process.env.REPUTATION_TOKEN_ZKSYNC,
    maxMintAmount: ethers.utils.parseEther("1000"),
    decayFactor: 86400, // 24 hours in seconds
    minReputationScore: 100,
    
    authorizedChains: [
        "16015286601757825753", // Sepolia
        "13264668187771770619"  // BSC Testnet
    ],
    
    adminAddress: process.env.ADMIN_ADDRESS,
    operatorAddress: process.env.OPERATOR_ADDRESS,
    minterAddress: process.env.MINTER_ADDRESS,
    
    verifyContract: true
};