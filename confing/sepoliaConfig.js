const config = require('./config');

module.exports = {
    addresses: {
        ccipRouter: config.addresses.ccipRouter.sepolia,
        linkToken: config.addresses.linkToken.sepolia
    },
    chainSelectors: {
        sepolia: config.chainSelectors.sepolia
    },
    common: {
        reputationParams: config.common.reputationParams
    },
    reputation: config.common.reputationParams
};