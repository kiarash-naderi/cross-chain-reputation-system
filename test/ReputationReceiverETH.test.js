const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationReceiverETH", function () {
    // Fixture for deploying contracts
    async function deployReceiverFixture() {
        const [owner, user1, user2] = await ethers.getSigners();
        
        // Get configuration
        const config = require("../config/sepoliaConfig.js");

        // Deploy mock CCIP router for testing
        const MockRouter = await ethers.getContractFactory("MockCCIPRouter");
        const mockRouter = await MockRouter.deploy();
        
        // Deploy receiver contract
        const ReputationReceiverETH = await ethers.getContractFactory("ReputationReceiverETH");
        const receiverETH = await ReputationReceiverETH.deploy(
            config.common.reputationParams.maxMintAmount
        );

        await receiverETH.deployed();

        return { receiverETH, mockRouter, owner, user1, user2, config };
    }

    describe("Deployment", function () {
        it("Should set the correct max mint amount", async function () {
            const { receiverETH, config } = await loadFixture(deployReceiverFixture);
            expect(await receiverETH.maxMintAmount()).to.equal(
                config.common.reputationParams.maxMintAmount
            );
        });

        it("Should set the right owner", async function () {
            const { receiverETH, owner } = await loadFixture(deployReceiverFixture);
            expect(await receiverETH.hasRole(await receiverETH.DEFAULT_ADMIN_ROLE(), owner.address))
                .to.be.true;
        });
    });

    describe("Source Chain Authorization", function () {
        it("Should allow admin to authorize source chain", async function () {
            const { receiverETH, config } = await loadFixture(deployReceiverFixture);
            await receiverETH.authorizeSourceChain(config.ccip.sourceChainSelector);
            expect(await receiverETH.authorizedSourceChains(config.ccip.sourceChainSelector))
                .to.be.true;
        });

        it("Should not allow non-admin to authorize chain", async function () {
            const { receiverETH, user1, config } = await loadFixture(deployReceiverFixture);
            await expect(
                receiverETH.connect(user1).authorizeSourceChain(config.ccip.sourceChainSelector)
            ).to.be.revertedWith("AccessControl");
        });
    });

    describe("CCIP Message Reception", function () {
        beforeEach(async function () {
            const { receiverETH, mockRouter, owner, config } = await loadFixture(deployReceiverFixture);
            await receiverETH.authorizeSourceChain(config.ccip.sourceChainSelector);
            await receiverETH.authorizeSender(config.ccip.sourceChainSelector, owner.address);
        });

        it("Should receive and process valid CCIP message", async function () {
            const { receiverETH, owner, user1, config } = await loadFixture(deployReceiverFixture);
            const amount = ethers.utils.parseEther("100");

            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverETH.address,
                nonce: 1
            };

            await expect(
                receiverETH.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.emit(receiverETH, "ReputationReceived")
                .withArgs(owner.address, user1.address, amount);

            expect(await receiverETH.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should reject message from unauthorized chain", async function () {
            const { receiverETH, owner, user1 } = await loadFixture(deployReceiverFixture);
            const amount = ethers.utils.parseEther("100");
            const unauthorizedChainId = "999";

            const message = {
                sourceChainSelector: unauthorizedChainId,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverETH.address,
                nonce: 1
            };

            await expect(
                receiverETH.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.be.revertedWithCustomError(receiverETH, "UnauthorizedChain");
        });

        it("Should reject message exceeding max mint amount", async function () {
            const { receiverETH, owner, user1, config } = await loadFixture(deployReceiverFixture);
            const amount = ethers.utils.parseEther("1001"); // More than maxMintAmount

            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverETH.address,
                nonce: 1
            };

            await expect(
                receiverETH.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.be.revertedWithCustomError(receiverETH, "ExceedsMaxMintAmount");
        });
    });

    describe("Token Recovery", function () {
        it("Should allow admin to recover tokens", async function () {
            const { receiverETH, owner } = await loadFixture(deployReceiverFixture);
            const MockToken = await ethers.getContractFactory("MockERC20");
            const mockToken = await MockToken.deploy();
            await mockToken.deployed();

            // Send some tokens to the contract
            const amount = ethers.utils.parseEther("1");
            await mockToken.transfer(receiverETH.address, amount);

            const recoveryId = ethers.utils.keccak256(
                ethers.utils.defaultAbiCoder.encode(
                    ["string", "address", "uint256"],
                    ["recover", mockToken.address, await ethers.provider.getBlockNumber()]
                )
            );

            await receiverETH.proposeRecovery(mockToken.address);
            
            // Wait for timelock
            await ethers.provider.send("evm_increaseTime", [86400]); // 24 hours
            await ethers.provider.send("evm_mine");

            await expect(
                receiverETH.executeRecovery(recoveryId, mockToken.address)
            ).to.emit(receiverETH, "TokensRecovered")
                .withArgs(mockToken.address, amount);
        });
    });

    describe("Pausable Functionality", function () {
        it("Should pause and unpause correctly", async function () {
            const { receiverETH } = await loadFixture(deployReceiverFixture);
            await receiverETH.pause();
            expect(await receiverETH.paused()).to.be.true;
            await receiverETH.unpause();
            expect(await receiverETH.paused()).to.be.false;
        });

        it("Should not process messages when paused", async function () {
            const { receiverETH, owner, user1, config } = await loadFixture(deployReceiverFixture);
            await receiverETH.pause();

            const amount = ethers.utils.parseEther("100");
            const message = {
                sourceChainSelector: config.ccip.sourceChainSelector,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [owner.address]),
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                destAddress: receiverETH.address,
                nonce: 1
            };

            await expect(
                receiverETH.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.be.revertedWith("Pausable: paused");
        });
    });
});