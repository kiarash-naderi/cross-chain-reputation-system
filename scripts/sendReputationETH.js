const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting reputation transfer to Sepolia...");

    try {
        // Get network config and deployment info
        const networkConfig = require("../config/sepoliaConfig.js");
        const senderDeployment = require("./deployments/sepolia.json");
        const receiverDeployment = require("./deployments/receiverETH.json");

        // Get signer
        const [sender] = await ethers.getSigners();
        console.log("Sending from account:", sender.address);
        console.log("Account balance:", (await sender.getBalance()).toString());

        // Get contract instance
        const ReputationSender = await ethers.getContractFactory("ReputationSender");
        const reputationSender = ReputationSender.attach(senderDeployment.reputationSender);

        // Transfer parameters
        const destinationChainSelector = networkConfig.chainSelector; // Sepolia chain selector
        const receiverAddress = process.env.RECEIVER_ADDRESS || receiverDeployment.receiverETH;
        const amount = ethers.utils.parseEther(process.env.TRANSFER_AMOUNT || "1.0");

        console.log(`Preparing to send ${amount} reputation to ${receiverAddress}`);

        // Estimate fees
        const estimatedFees = await reputationSender.estimateFee(
            destinationChainSelector,
            receiverAddress,
            ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [receiverAddress, amount])
        );

        console.log(`Estimated fees: ${ethers.utils.formatEther(estimatedFees)} ETH`);

        // Send reputation
        console.log("Sending reputation...");
        const tx = await reputationSender.sendReputation(
            destinationChainSelector,
            receiverAddress,
            amount,
            { value: estimatedFees.mul(11).div(10) } // Add 10% buffer for gas price fluctuations
        );

        console.log("Transaction hash:", tx.hash);
        console.log("Waiting for confirmation...");

        const receipt = await tx.wait();
        
        // Get message ID from events
        const ccipEvent = receipt.events.find(e => e.event === "CCIPSendRequested");
        const messageId = ccipEvent.args.messageId;

        console.log("\nTransfer completed!");
        console.log("Message ID:", messageId);
        console.log(`Amount: ${ethers.utils.formatEther(amount)} reputation`);
        console.log(`Destination chain: Sepolia`);
        console.log(`Receiver: ${receiverAddress}`);
        
        // Save transfer details
        const transferInfo = {
            messageId,
            amount: amount.toString(),
            sender: sender.address,
            receiver: receiverAddress,
            destinationChain: "Sepolia",
            timestamp: new Date().toISOString(),
            transactionHash: tx.hash
        };

        const fs = require("fs");
        const transferPath = `./transfers/eth_${messageId}.json`;
        fs.writeFileSync(transferPath, JSON.stringify(transferInfo, null, 2));
        console.log(`Transfer information saved to ${transferPath}`);

    } catch (error) {
        console.error("Error during transfer:", error);
        if (error.reason) console.error("Reason:", error.reason);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });