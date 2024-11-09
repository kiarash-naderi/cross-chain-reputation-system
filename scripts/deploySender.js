const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Starting ReputationSender deployment...");

    try {
        // Get network configurations
        const networkConfig = require(`../config/${hre.network.name}Config.js`);
        
        // Get deployer account
        const [deployer] = await ethers.getSigners();
        console.log("Deploying contracts with account:", deployer.address);
        console.log("Account balance:", (await deployer.getBalance()).toString());

        // Get contract factory
        const ReputationSender = await ethers.getContractFactory("ReputationSender");
        
        // Constructor parameters
        const CCIP_ROUTER = networkConfig.ccipRouter;
        const REPUTATION_TOKEN = networkConfig.reputationToken;
        const DECAY_FACTOR = networkConfig.decayFactor;
        const MIN_REPUTATION = networkConfig.minReputationScore;

        console.log(`Using CCIP Router: ${CCIP_ROUTER}`);
        console.log(`Using Reputation Token: ${REPUTATION_TOKEN}`);

        // Deploy contract
        const reputationSender = await ReputationSender.deploy(
            CCIP_ROUTER,
            REPUTATION_TOKEN,
            DECAY_FACTOR,
            MIN_REPUTATION
        );

        await reputationSender.deployed();
        console.log("ReputationSender deployed to:", reputationSender.address);

        // Setup initial configuration
        console.log("Setting up initial configuration...");

        // Authorize chains with retry
        for (const chain of networkConfig.authorizedChains) {
            let retries = 3;
            while (retries > 0) {
                try {
                    await reputationSender.authorizeChain(chain);
                    console.log(`Authorized chain: ${chain}`);
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    console.log(`Retrying chain authorization for ${chain}...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        // Setup roles
        const MINTER_ROLE = ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("MINTER_ROLE")
        );
        const ADMIN_ROLE = ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("ADMIN_ROLE")
        );

        // Grant roles to deployer or other addresses
        if (networkConfig.minterAddress) {
            await reputationSender.grantRole(MINTER_ROLE, networkConfig.minterAddress);
            console.log(`Granted MINTER_ROLE to: ${networkConfig.minterAddress}`);
        }

        if (networkConfig.adminAddress) {
            await reputationSender.grantRole(ADMIN_ROLE, networkConfig.adminAddress);
            console.log(`Granted ADMIN_ROLE to: ${networkConfig.adminAddress}`);
        }

        // Verify contract on explorer if network supports it
        if (networkConfig.verifyContract) {
            console.log("Waiting for blocks to be mined...");
            await reputationSender.deployTransaction.wait(6); // Wait for 6 blocks

            console.log("Verifying contract...");
            await hre.run("verify:verify", {
                address: reputationSender.address,
                constructorArguments: [
                    CCIP_ROUTER,
                    REPUTATION_TOKEN,
                    DECAY_FACTOR,
                    MIN_REPUTATION
                ],
            });
        }

        // Output deployment information
        const deploymentInfo = {
            network: hre.network.name,
            reputationSender: reputationSender.address,
            ccipRouter: CCIP_ROUTER,
            reputationToken: REPUTATION_TOKEN,
            deployer: deployer.address,
            timestamp: new Date().toISOString()
        };

        console.log("\nDeployment Information:", deploymentInfo);

        // Save deployment information
        const fs = require("fs");
        const deploymentPath = `./deployments/${hre.network.name}.json`;
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`Deployment information saved to ${deploymentPath}`);

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