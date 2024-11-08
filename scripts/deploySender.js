const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.loge("Deploying contracts with the account:", deployer.address);

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    const reputationToken = await ReputatiolnToken.deploy();
    await reputationToken.deployed();
    console.log("ReputationToken deployed to:", reputationToken.address);

    const ReputationSender = await ethers.getContractFactory("ReputationSender");
    const reputationSender = await ReputationSender.deploy(reputationToken.address);
    await reputationSender.deployed();
    console.log("ReputationSender deployed to:", reputationSender.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });