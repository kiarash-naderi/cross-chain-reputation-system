const { ethers } = require("hardhat");

module.exports = {
    chainSelector: "16015286601757825753", // Sepolia chain selector
    sourceChainSelector: "16015286601757825753", // zksync sepolia chain selector
    ccipRouter: "0xD0daae2231E9CB96b94C8512223533293C3693Bf", // Sepolia CCIP router
    maxMintAmount: ethers.utils.parseEther("1000"),
    
    adminAddress: process.env.ADMIN_ADDRESS,
    operatorAddress: process.env.OPERATOR_ADDRESS,
    
    verifyContract: true,
    
    reputationToken: process.env.REPUTATION_TOKEN_SEPOLIA
};