const { ethers } = require("hardhat");

async function main() {
  const [sender] = await ethers.getSigners();
  console.log("Initiating cross-chain transfer from account:", sender.address);

  const reputationSenderAddress = "0x..."; // Replace with the deployed ReputationSender contract address
  const reputationReceiverBSCAddress = "0x..."; // Replace with the deployed ReputationReceiverBSC contract address

  const ReputationSender = await ethers.getContractFactory("ReputationSender");
  const reputationSender = ReputationSender.attach(reputationSenderAddress);

  const amount = ethers.utils.parseUnits("100", 18); // Transfer 100 tokens
  const dstChainId = 97; // BSC Testnet chain ID
  const dstContract = reputationReceiverBSCAddress;

  const tx = await reputationSender.sendReputation(sender.address, amount, dstChainId, dstContract);
  await tx.wait();

  console.log("Cross-chain transfer initiated to BSC Testnet");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });