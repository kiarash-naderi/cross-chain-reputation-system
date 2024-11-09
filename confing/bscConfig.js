const { ethers } = require("hardhat");

module.exports = {
    chainSelector: "13264668187771770619", // BSC Testnet chain selector
    sourceChainSelector: "16015286601757825753", // zksync sepolia chain selector
    ccipRouter: "0x9527E2d01A3064ef6b50c1Da1C0cC523803BCFF2", // BSC Testnet CCIP router
    maxMintAmount: ethers.utils.parseEther("1000"),
    
    adminAddress: process.env.ADMIN_ADDRESS,
    operatorAddress: process.env.OPERATOR_ADDRESS,
    
    verifyContract: true,
    
    reputationToken: process.env.REPUTATION_TOKEN_BSC
};