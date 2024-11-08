const { ethers } = require("hardhat");

async function main() {
  const reputationReceiverETHAddress = "0x..."; // Replace with the deployed ReputationReceiverETH contract address
  const reputationReceiverBSCAddress = "0x..."; // Replace with the deployed ReputationReceiverBSC contract address

  const ReputationReceiverETH = await ethers.getContractFactory("ReputationReceiverETH");
  const reputationReceiverETH = ReputationReceiverETH.attach(reputationReceiverETHAddress);

  const ReputationReceiverBSC = await ethers.getContractFactory("ReputationReceiverBSC");
  const reputationReceiverBSC = ReputationReceiverBSC.attach(reputationReceiverBSCAddress);

  console.log("Listening for cross-chain reputation transfers...");

  reputationReceiverETH.on("CCIPReceived", async (srcChainId, srcAddress, dstAddress, nonce, payload) => {
    console.log("Received cross-chain transfer on Ethereum Sepolia:");
    console.log("Source Chain ID:", srcChainId);
    console.log("Source Address:", srcAddress);
    console.log("Destination Address:", dstAddress);
    console.log("Nonce:", nonce);
    console.log("Payload:", payload);

    const tx = await reputationReceiverETH.ccipReceive(srcChainId, srcAddress, dstAddress, nonce, payload);
    await tx.wait();

    console.log("Reputation tokens minted on Ethereum Sepolia");
  });

  reputationReceiverBSC.on("CCIPReceived", async (srcChainId, srcAddress, dstAddress, nonce, payload) => {
    console.log("Received cross-chain transfer on BSC Testnet:");
    console.log("Source Chain ID:", srcChainId);
    console.log("Source Address:", srcAddress);
    console.log("Destination Address:", dstAddress);
    console.log("Nonce:", nonce);
    console.log("Payload:", payload);

    const tx = await reputationReceiverBSC.ccipReceive(srcChainId, srcAddress, dstAddress, nonce, payload);
    await tx.wait();

    console.log("Reputation tokens minted on BSC Testnet");
  });
}

main()
  .then(() => {
    console.log("Listening for cross-chain transfers...");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });