const config = require('./config');

module.exports = {
    chainSelectors: {
        zksync: config.chainSelectors.zksync
    },
    reputation: config.common.reputationParams
};