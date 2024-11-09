const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting reputation reception verification...");

    try {
        // Get message ID from command line or environment
        const messageId = process.env.MESSAGE_ID || process.argv[2];
        if (!messageId) {
            throw new Error("MESSAGE_ID is required!");
        }

        // Determine network and load appropriate config
        const network = process.env.NETWORK || "sepolia"; // or "bsc"
        const networkConfig = require(`../config/${network}Config.js`);
        
        // Load deployment info based on network
        const receiverContractAddress = network === "sepolia" 
            ? require("./deployments/receiverETH.json").receiverETH
            : require("./deployments/receiverBSC.json").receiverBSC;

        // Get signer
        const [receiver] = await ethers.getSigners();
        console.log("Checking from account:", receiver.address);
        
        // Get contract instance based on network
        const ReceiverContract = await ethers.getContractFactory(
            network === "sepolia" ? "ReputationReceiverETH" : "ReputationReceiverBSC"
        );
        const receiverContract = ReceiverContract.attach(receiverContractAddress);

        // Check if message was processed
        const isProcessed = await receiverContract.isMessageProcessed(messageId);
        console.log(`Message processed: ${isProcessed}`);

        if (isProcessed) {
            const fs = require("fs");
            const transferPath = `./transfers/${network}_${messageId}.json`;
            
            if (!fs.existsSync(transferPath)) {
                console.log("Transfer details not found. This might be a new transfer.");
                return;
            }
            
            try {
                const transferInfo = JSON.parse(fs.readFileSync(transferPath));

                console.log("\nTransfer Details:");
                console.log("Sender:", transferInfo.sender);
                console.log("Receiver:", transferInfo.receiver);
                console.log("Amount:", ethers.utils.formatEther(transferInfo.amount));
                console.log("Timestamp:", transferInfo.timestamp);
                
                // Get receiver's current balance
                const balance = await receiverContract.balanceOf(transferInfo.receiver);
                console.log("\nCurrent receiver balance:", ethers.utils.formatEther(balance));
            } catch (error) {
                console.error("Error reading transfer file:", error);
                return;
            }
        } else {
            console.log("\nMessage has not been processed yet.");
            console.log("Please wait for CCIP message to be delivered.");
            console.log("You can check CCIP Explorer for message status.");
        }

    } catch (error) {
        console.error("Error during reception verification:", error);
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