const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const ReputationReceiverBSC = await ethers.getContractFactory("ReputationReceiverBSC");
  const reputationReceiverBSC = await ReputationReceiverBSC.deploy();
  await reputationReceiverBSC.deployed();
  console.log("ReputationReceiverBSC deployed to:", reputationReceiverBSC.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });