const config = require('./config');

module.exports = {
    chainSelectors: {
        bscTestnet: config.chainSelectors.bscTestnet
    },
    common: {
        reputationParams: config.common.reputationParams
    },
    reputation: config.common.reputationParams
};