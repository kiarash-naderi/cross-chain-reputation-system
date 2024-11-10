const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ReputationReceiverZK", function () {
    async function deployReceiverFixture() {
        const [owner, user1, user2] = await ethers.getSigners();
        
        // Get configuration
        const config = require("../config/zkSyncConfig.js");

        // Deploy mock zkSync bridge
        const MockZkBridge = await ethers.getContractFactory("MockZkBridge");
        const mockZkBridge = await MockZkBridge.deploy();
        
        // Deploy receiver contract
        const ReputationReceiverZK = await ethers.getContractFactory("ReputationReceiverZK");
        const receiverZK = await ReputationReceiverZK.deploy(
            config.reputation.maxMintAmount,
            mockZkBridge.address
        );

        await receiverZK.deployed();

        return { receiverZK, mockZkBridge, owner, user1, user2, config };
    }

    describe("Deployment", function () {
        it("Should set the correct max mint amount", async function () {
            const { receiverZK, config } = await loadFixture(deployReceiverFixture);
            expect(await receiverZK.maxMintAmount()).to.equal(
                config.reputation.maxMintAmount
            );
        });

        it("Should initialize with correct token name and symbol", async function () {
            const { receiverZK } = await loadFixture(deployReceiverFixture);
            expect(await receiverZK.name()).to.equal("ReputationTokenZK");
            expect(await receiverZK.symbol()).to.equal("REPZK");
        });
    });

    describe("ZkSync Message Reception", function () {
        beforeEach(async function () {
            const { receiverZK, mockZkBridge, owner, config } = await loadFixture(deployReceiverFixture);
            await receiverZK.authorizeSourceChain(config.chainSelectors.sepolia);
            await receiverZK.authorizeSender(config.chainSelectors.sepolia, owner.address);
        });

        it("Should handle L2 message processing", async function () {
            const { receiverZK, owner, user1, config } = await loadFixture(deployReceiverFixture);
            const amount = ethers.utils.parseEther("100");

            const message = {
                sourceChainSelector: config.chainSelectors.sepolia,
                sender: owner.address,
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, amount]
                ),
                l2Hash: ethers.utils.randomBytes(32)
            };

            await expect(
                receiverZK.processL2Message(
                    message.sourceChainSelector,
                    message.sender,
                    message.data,
                    message.l2Hash
                )
            ).to.emit(receiverZK, "L2MessageProcessed")
                .withArgs(message.sender, user1.address, amount);

            expect(await receiverZK.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should verify L2 proofs", async function () {
            const { receiverZK, owner, user1 } = await loadFixture(deployReceiverFixture);
            
            const mockProof = {
                merkleRoot: ethers.utils.randomBytes(32),
                proof: [ethers.utils.randomBytes(32), ethers.utils.randomBytes(32)],
                index: 1
            };

            await expect(
                receiverZK.verifyL2Proof(mockProof.merkleRoot, mockProof.proof, mockProof.index)
            ).to.emit(receiverZK, "ProofVerified");
        });
    });

    describe("ZkSync Security Features", function () {
        it("Should handle L2 specific emergency stops", async function () {
            const { receiverZK, owner } = await loadFixture(deployReceiverFixture);
            
            await receiverZK.connect(owner).pauseL2Bridge();
            expect(await receiverZK.l2BridgePaused()).to.be.true;

            await receiverZK.connect(owner).unpauseL2Bridge();
            expect(await receiverZK.l2BridgePaused()).to.be.false;
        });

        it("Should prevent invalid L2 messages", async function () {
            const { receiverZK, user1, config } = await loadFixture(deployReceiverFixture);
            
            const invalidMessage = {
                sourceChainSelector: config.chainSelectors.sepolia,
                sender: user1.address, // Unauthorized sender
                data: ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [user1.address, ethers.utils.parseEther("100")]
                ),
                l2Hash: ethers.utils.randomBytes(32)
            };

            await expect(
                receiverZK.processL2Message(
                    invalidMessage.sourceChainSelector,
                    invalidMessage.sender,
                    invalidMessage.data,
                    invalidMessage.l2Hash
                )
            ).to.be.revertedWith("Unauthorized L2 sender");
        });
    });
}); 