module.exports = {
    chainlinkNodeUrls: {
      zkSyncTestnet: "https://zksync2-testnet.zksync.dev",
      sepoliaTestnet: "https://rpc.sepolia.org",
      bscTestnet: "https://data-seed-prebsc-1-s1.binance.org:8545",
    },
    apiKeys: {
      zkSyncTestnet: process.env.ZKSYNC_API_KEY,
      sepoliaTestnet: process.env.SEPOLIA_API_KEY,
      bscTestnet: process.env.BSC_API_KEY,
    },
    contracts: {
      reputationToken: {
        zkSyncTestnet: "0x...",
        sepoliaTestnet: "0x...",
        bscTestnet: "0x...",
      },
      reputationSender: {
        zkSyncTestnet: "0x...",
      },
      reputationReceiverETH: {
        sepoliaTestnet: "0x...",
      },
      reputationReceiverBSC: {
        bscTestnet: "0x...",
      },
    },
  };