const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationReceiverBSC", function () {
    // Fixture for deploying contracts
    async function deployReceiverFixture() {
        const [owner, user1, user2] = await ethers.getSigners();
        
        // Get BSC configuration
        const config = require("../config/bscConfig.js");

        // Deploy mock CCIP router for testing
        const MockRouter = await ethers.getContractFactory("MockCCIPRouter");
        const mockRouter = await MockRouter.deploy();
        
        // Deploy BSC receiver contract
        const ReputationReceiverBSC = await ethers.getContractFactory("ReputationReceiverBSC");
        const receiverBSC = await ReputationReceiverBSC.deploy(
            config.common.reputationParams.maxMintAmount
        );

        await receiverBSC.deployed();

        return { receiverBSC, mockRouter, owner, user1, user2, config };
    }

    describe("Deployment", function () {
        it("Should set the correct max mint amount", async function () {
            const { receiverBSC, config } = await loadFixture(deployReceiverFixture);
            expect(await receiverBSC.maxMintAmount()).to.equal(
                config.common.reputationParams.maxMintAmount
            );
        });

        it("Should initialize with correct token name and symbol", async function () {
            const { receiverBSC } = await loadFixture(deployReceiverFixture);
            expect(await receiverBSC.name()).to.equal("ReputationTokenBSC");
            expect(await receiverBSC.symbol()).to.equal("REPBSC");
        });
    });

    describe("Source Chain Authorization", function () {
        it("Should allow admin to authorize Sepolia as source chain", async function () {
            const { receiverBSC, config } = await loadFixture(deployReceiverFixture);
            await receiverBSC.authorizeSourceChain(config.ccip.sourceChainSelector);
            expect(await receiverBSC.authorizedSourceChains(config.ccip.sourceChainSelector))
                .to.be.true;
        });

        it("Should enforce BSC-specific gas limits", async function () {
            const { receiverBSC, user1, config } = await loadFixture(deployReceiverFixture);
            const amount = ethers.utils.parseEther("100");

            // Set up message with high gas usage
            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [user1.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverBSC.address,
                nonce: 1
            };

            // Should enforce BSC gas limits
            // This might need adjustment based on your specific BSC gas requirements
            await expect(
                receiverBSC.estimateGas.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.be.lte(config.gas.gasLimit);
        });
    });

    describe("CCIP Message Reception on BSC", function () {
        beforeEach(async function () {
            const { receiverBSC, mockRouter, owner, config } = await loadFixture(deployReceiverFixture);
            await receiverBSC.authorizeSourceChain(config.ccip.sourceChainSelector);
            await receiverBSC.authorizeSender(config.ccip.sourceChainSelector, owner.address);
        });

        it("Should handle BSC-specific message processing", async function () {
            const { receiverBSC, owner, user1, config } = await loadFixture(deployReceiverFixture);
            const amount = ethers.utils.parseEther("100");

            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverBSC.address,
                nonce: 1
            };

            // Process message and verify BSC-specific event emission
            await expect(
                receiverBSC.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.emit(receiverBSC, "ReputationReceived")
                .withArgs(owner.address, user1.address, amount);

            // Verify token minting on BSC
            expect(await receiverBSC.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should enforce BSC daily limits", async function () {
            const { receiverBSC, owner, user1, config } = await loadFixture(deployReceiverFixture);
            const dailyLimit = config.reputation.dailyLimit;
            const amount = dailyLimit.add(1); // Exceed daily limit

            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverBSC.address,
                nonce: 1
            };

            await expect(
                receiverBSC.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.be.revertedWithCustomError(receiverBSC, "DailyLimitExceeded");
        });
    });

    describe("BSC-Specific Security Features", function () {
        it("Should handle BNB recovery correctly", async function () {
            const { receiverBSC, owner } = await loadFixture(deployReceiverFixture);
            
            // Send BNB to contract
            await owner.sendTransaction({
                to: receiverBSC.address,
                value: ethers.utils.parseEther("1")
            });

            const recoveryId = ethers.utils.keccak256(
                ethers.utils.defaultAbiCoder.encode(
                    ["string", "address", "uint256"],
                    ["recover", ethers.constants.AddressZero, await ethers.provider.getBlockNumber()]
                )
            );

            await receiverBSC.proposeRecovery(ethers.constants.AddressZero);
            
            // Wait for timelock
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");

            const initialBalance = await owner.getBalance();
            await receiverBSC.executeRecovery(recoveryId, ethers.constants.AddressZero);
            const finalBalance = await owner.getBalance();

            expect(finalBalance.sub(initialBalance)).to.be.gt(0);
        });

        it("Should handle BSC-specific monitoring thresholds", async function () {
            const { receiverBSC, owner, user1, config } = await loadFixture(deployReceiverFixture);
            const amount = config.monitoring.alertThreshold;

            // Monitor large transfers
            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverBSC.address,
                nonce: 1
            };

            await expect(
                receiverBSC.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.emit(receiverBSC, "LargeTransferProcessed")
                .withArgs(user1.address, amount);
        });
    });
});