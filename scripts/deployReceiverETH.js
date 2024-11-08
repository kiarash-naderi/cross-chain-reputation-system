const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const ReputationReceiverETH = await ethers.getContractFactory("ReputationReceiverETH");
  const reputationReceiverETH = await ReputationReceiverETH.deploy();
  await reputationReceiverETH.deployed();
  console.log("ReputationReceiverETH deployed to:", reputationReceiverETH.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });