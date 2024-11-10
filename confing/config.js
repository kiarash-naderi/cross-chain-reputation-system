const { ethers } = require("ethers");

const maxMintAmount = "1000000000000000000000000"; // 1M tokens
const decayFactor = 100;
const minReputationScore = "10000000000000000000"; // 10 tokens

module.exports = {
    common: {
        reputationParams: {
            maxMintAmount,
            decayFactor,
            minReputationScore
        }
    },
    chainSelectors: {
        sepolia: "16015286601757825753",
        bscTestnet: "13264668187771770619",
        zksync: "12532609583862916517"
    },
    addresses: {
        linkToken: {
            sepolia: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
            bscTestnet: "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06"
        },
        ccipRouter: {
            sepolia: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
            bscTestnet: "0x9527E2d01A3064ef6b50c1Da1C0cC523803BCDF3"
        }
    }
};