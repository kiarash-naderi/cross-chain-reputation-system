const { ethers } = require("hardhat");

async function main() {
  const [sender] = await ethers.getSigners();
  console.log("Initiating cross-chain transfer from account:", sender.address);

  const reputationSenderAddress = "0x..."; // Replace with the deployed ReputationSender contract address
  const reputationReceiverETHAddress = "0x..."; // Replace with the deployed ReputationReceiverETH contract address

  const ReputationSender = await ethers.getContractFactory("ReputationSender");
  const reputationSender = ReputationSender.attach(reputationSenderAddress);

  const amount = ethers.utils.parseUnits("100", 18); // Transfer 100 tokens
  const dstChainId = 1; // Ethereum Sepolia chain ID
  const dstContract = reputationReceiverETHAddress;

  const tx = await reputationSender.sendReputation(sender.address, amount, dstChainId, dstContract);
  await tx.wait();

  console.log("Cross-chain transfer initiated to Ethereum Sepolia");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });