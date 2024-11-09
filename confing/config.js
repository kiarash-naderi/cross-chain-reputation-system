require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

module.exports = {
    networks: {
        zkSepolia: {
            url: process.env.ZKSYNC_SEPOLIA_RPC_URL,
            accounts: [process.env.PRIVATE_KEY],
            chainId: 300,
            verifyURL: process.env.ZKSYNC_VERIFY_URL
        },
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL,
            accounts: [process.env.PRIVATE_KEY],
            chainId: 11155111
        },
        bscTestnet: {
            url: process.env.BSC_TESTNET_RPC_URL,
            accounts: [process.env.PRIVATE_KEY],
            chainId: 97
        }
    },
    etherscan: {
        apiKey: {
            zkSepolia: process.env.ZKSCAN_API_KEY,
            sepolia: process.env.ETHERSCAN_API_KEY,
            bscTestnet: process.env.BSCSCAN_API_KEY
        }
    },
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    }
};