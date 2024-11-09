const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting ReputationReceiverETH deployment on Sepolia...");

    try {
        // Get network config
        const networkConfig = require(`../config/sepoliaConfig.js`);
        
        // Get deployer account
        const [deployer] = await ethers.getSigners();
        console.log("Deploying contracts with account:", deployer.address);
        console.log("Account balance:", (await deployer.getBalance()).toString());

        // Get contract factory
        const ReputationReceiverETH = await ethers.getContractFactory("ReputationReceiverETH");
        
        // Constructor parameters
        const MAX_MINT_AMOUNT = networkConfig.maxMintAmount;
        
        console.log(`Using max mint amount: ${MAX_MINT_AMOUNT}`);

        // Deploy contract
        const receiverETH = await ReputationReceiverETH.deploy(MAX_MINT_AMOUNT);
        await receiverETH.deployed();

        console.log("ReputationReceiverETH deployed to:", receiverETH.address);

        // Setup initial configuration
        console.log("Setting up initial configuration...");

        // Get ReputationSender address from deployments
        const deploymentPath = `./deployments/${hre.network.name}.json`;
        const senderDeployment = require(deploymentPath);
        const SENDER_ADDRESS = senderDeployment.reputationSender;

        // Authorize sender
        await receiverETH.authorizeSender(
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
            await receiverETH.grantRole(OPERATOR_ROLE, networkConfig.operatorAddress);
            console.log(`Granted OPERATOR_ROLE to: ${networkConfig.operatorAddress}`);
        }

        if (networkConfig.adminAddress) {
            await receiverETH.grantRole(ADMIN_ROLE, networkConfig.adminAddress);
            console.log(`Granted ADMIN_ROLE to: ${networkConfig.adminAddress}`);
        }

        // Verify contract
        if (networkConfig.verifyContract) {
            console.log("Waiting for blocks to be mined...");
            await receiverETH.deployTransaction.wait(6);

            console.log("Verifying contract...");
            await hre.run("verify:verify", {
                address: receiverETH.address,
                constructorArguments: [MAX_MINT_AMOUNT],
            });
        }

        // Save deployment info
        const deploymentInfo = {
            network: hre.network.name,
            receiverETH: receiverETH.address,
            senderAddress: SENDER_ADDRESS,
            deployer: deployer.address,
            timestamp: new Date().toISOString()
        };

        const fs = require("fs");
        const receiverDeploymentPath = `./deployments/receiverETH.json`;
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