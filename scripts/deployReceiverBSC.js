const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting ReputationReceiverBSC deployment on BSC Testnet...");

    try {
        // Get network config
        const networkConfig = require(`../config/bscConfig.js`);
        
        // Get deployer account
        const [deployer] = await ethers.getSigners();
        console.log("Deploying contracts with account:", deployer.address);
        console.log("Account balance:", (await deployer.getBalance()).toString());

        // Get contract factory
        const ReputationReceiverBSC = await ethers.getContractFactory("ReputationReceiverBSC");
        
        // Constructor parameters
        const MAX_MINT_AMOUNT = networkConfig.maxMintAmount;
        
        console.log(`Using max mint amount: ${MAX_MINT_AMOUNT}`);

        // Deploy contract
        const receiverBSC = await ReputationReceiverBSC.deploy(MAX_MINT_AMOUNT);
        await receiverBSC.deployed();

        console.log("ReputationReceiverBSC deployed to:", receiverBSC.address);

        // Setup initial configuration
        console.log("Setting up initial configuration...");

        // Get ReputationSender address from deployments
        const deploymentPath = `./deployments/${hre.network.name}.json`;
        const senderDeployment = require(deploymentPath);
        const SENDER_ADDRESS = senderDeployment.reputationSender;

        // Authorize sender
        await receiverBSC.authorizeSender(
            networkConfig.sourceChainSelector, 
            SENDER_ADDRESS
        );
        console.log(`Authorized sender ${SENDER_ADDRESS} for chain ${networkConfig.sourceChainSelector}`);

        // Set up roles
        const OPERATOR_ROLE = ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("OPERATOR_ROLE")
        );
        const ADMIN_ROLE = ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("ADMIN_ROLE")
        );

        // Grant roles
        if (networkConfig.operatorAddress) {
            await receiverBSC.grantRole(OPERATOR_ROLE, networkConfig.operatorAddress);
            console.log(`Granted OPERATOR_ROLE to: ${networkConfig.operatorAddress}`);
        }

        if (networkConfig.adminAddress) {
            await receiverBSC.grantRole(ADMIN_ROLE, networkConfig.adminAddress);
            console.log(`Granted ADMIN_ROLE to: ${networkConfig.adminAddress}`);
        }

        // Verify contract
        if (networkConfig.verifyContract) {
            console.log("Waiting for blocks to be mined...");
            await receiverBSC.deployTransaction.wait(6);

            console.log("Verifying contract...");
            await hre.run("verify:verify", {
                address: receiverBSC.address,
                constructorArguments: [MAX_MINT_AMOUNT],
            });
        }

        // Save deployment info
        const deploymentInfo = {
            network: hre.network.name,
            receiverBSC: receiverBSC.address,
            senderAddress: SENDER_ADDRESS,
            deployer: deployer.address,
            timestamp: new Date().toISOString()
        };

        const fs = require("fs");
        const receiverDeploymentPath = `./deployments/receiverBSC.json`;
        fs.writeFileSync(receiverDeploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`Deployment information saved to ${receiverDeploymentPath}`);

    } catch (error) {
        console.error("Error during deployment:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });