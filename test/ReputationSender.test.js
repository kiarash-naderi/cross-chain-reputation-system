const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationSender", function () {
    // Fixture to deploy contracts
    async function deployReputationSenderFixture() {
        const [owner, user1, user2] = await ethers.getSigners();

        // Get contract factory
        const ReputationSender = await ethers.getContractFactory("ReputationSender");
        
        // Get configuration
        const config = require("../config/sepoliaConfig.js");
        
        // Deploy contract
        const reputationSender = await ReputationSender.deploy(
            config.addresses.ccipRouter,
            config.addresses.linkToken,
            config.common.reputationParams.decayFactor,
            config.common.reputationParams.minReputationScore
        );

        await reputationSender.deployed();

        return { reputationSender, owner, user1, user2, config };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { reputationSender, owner } = await loadFixture(deployReputationSenderFixture);
            expect(await reputationSender.hasRole(await reputationSender.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        });

        it("Should set the initial parameters correctly", async function () {
            const { reputationSender, config } = await loadFixture(deployReputationSenderFixture);
            expect(await reputationSender.decayFactor()).to.equal(config.common.reputationParams.decayFactor);
            expect(await reputationSender.minReputationScore()).to.equal(config.common.reputationParams.minReputationScore);
        });
    });

    describe("Chain Authorization", function () {
        it("Should allow admin to authorize chain", async function () {
            const { reputationSender, owner, config } = await loadFixture(deployReputationSenderFixture);
            await reputationSender.authorizeChain(config.chainSelectors.bscTestnet);
            expect(await reputationSender.authorizedChains(config.chainSelectors.bscTestnet)).to.be.true;
        });

        it("Should not allow non-admin to authorize chain", async function () {
            const { reputationSender, user1, config } = await loadFixture(deployReputationSenderFixture);
            await expect(
                reputationSender.connect(user1).authorizeChain(config.chainSelectors.bscTestnet)
            ).to.be.revertedWith("AccessControl");
        });
    });

    describe("Reputation Management", function () {
        it("Should allow minting reputation", async function () {
            const { reputationSender, owner, user1 } = await loadFixture(deployReputationSenderFixture);
            const amount = ethers.utils.parseEther("100");
            await reputationSender.mintReputation(user1.address, amount);
            expect(await reputationSender.reputationScores(user1.address)).to.equal(amount);
        });

        it("Should apply decay factor correctly", async function () {
            const { reputationSender, user1 } = await loadFixture(deployReputationSenderFixture);
            const amount = ethers.utils.parseEther("100");
            await reputationSender.mintReputation(user1.address, amount);
            
            // Simulate time passing
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");

            const score = await reputationSender.calculateReputationScore(user1.address);
            expect(score).to.be.lt(amount);
        });
    });

    describe("Cross-Chain Transfer", function () {
        it("Should send reputation cross-chain", async function () {
            const { reputationSender, user1, config } = await loadFixture(deployReputationSenderFixture);
            
            // Setup
            await reputationSender.authorizeChain(config.chainSelectors.bscTestnet);
            const amount = ethers.utils.parseEther("50");
            await reputationSender.mintReputation(user1.address, amount);

            // Estimate fees
            const fees = await reputationSender.estimateFee(
                config.chainSelectors.bscTestnet,
                user1.address,
                ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [user1.address, amount])
            );

            // Send reputation
            await expect(
                reputationSender.connect(user1).sendReputation(
                    config.chainSelectors.bscTestnet,
                    user1.address,
                    amount,
                    { value: fees }
                )
            ).to.emit(reputationSender, "CCIPSendRequested");
        });

        it("Should fail if chain is not authorized", async function () {
            const { reputationSender, user1, config } = await loadFixture(deployReputationSenderFixture);
            const amount = ethers.utils.parseEther("50");
            await reputationSender.mintReputation(user1.address, amount);

            await expect(
                reputationSender.connect(user1).sendReputation(
                    config.chainSelectors.bscTestnet,
                    user1.address,
                    amount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ).to.be.revertedWithCustomError(reputationSender, "UnauthorizedChain");
        });
    });

    describe("Security Features", function () {
        it("Should pause and unpause correctly", async function () {
            const { reputationSender, owner } = await loadFixture(deployReputationSenderFixture);
            await reputationSender.pause();
            expect(await reputationSender.paused()).to.be.true;
            await reputationSender.unpause();
            expect(await reputationSender.paused()).to.be.false;
        });

        it("Should handle reentrancy protection", async function () {
            const { reputationSender, user1, config } = await loadFixture(deployReputationSenderFixture);
            await reputationSender.authorizeChain(config.chainSelectors.bscTestnet);
            const amount = ethers.utils.parseEther("50");
            await reputationSender.mintReputation(user1.address, amount);

            // Try to send reputation recursively (should fail)
            const AttackerFactory = await ethers.getContractFactory("ReputationAttacker");
            const attacker = await AttackerFactory.deploy(reputationSender.address);
            await attacker.deployed();

            await expect(
                attacker.attack(config.chainSelectors.bscTestnet, amount)
            ).to.be.reverted;
        });
    });

    describe("ZkSync Features", function () {
        it("Should handle L2 specific operations", async function () {
            const { reputationSender, user1, config } = await loadFixture(deployReputationSenderFixture);
            
            // Test L2 specific message passing
            const amount = ethers.utils.parseEther("50");
            await reputationSender.mintReputation(user1.address, amount);
            
            await expect(
                reputationSender.connect(user1).sendReputationL2(
                    config.chainSelectors.zksync,
                    user1.address,
                    amount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ).to.emit(reputationSender, "L2ReputationSent");
        });
        
        it("Should optimize gas for L2", async function () {
            const { reputationSender, user1, config } = await loadFixture(deployReputationSenderFixture);
            
            const amount = ethers.utils.parseEther("10");
            await reputationSender.mintReputation(user1.address, amount);
            
            const tx = await reputationSender.connect(user1).sendReputationL2(
                config.chainSelectors.zksync,
                user1.address,
                amount,
                { value: ethers.utils.parseEther("0.1") }
            );
            
            const receipt = await tx.wait();
            expect(receipt.gasUsed).to.be.lt(300000); // L2 gas limit
        });
    });
});