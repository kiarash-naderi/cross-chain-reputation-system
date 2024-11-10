const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Reputation System Integration", function () {
    async function deployFullSystemFixture() {
        const [owner, user1, user2] = await ethers.getSigners();
        
        // Load configs
        const sepoliaConfig = require("../config/sepoliaConfig.js");
        const bscConfig = require("../config/bscConfig.js");
        const zkSyncConfig = require("../config/zkSyncConfig.js");

        // Deploy mock CCIP router
        const MockRouter = await ethers.getContractFactory("MockCCIPRouter");
        const mockRouter = await MockRouter.deploy();

        // Deploy mock zkSync bridge
        const MockZkBridge = await ethers.getContractFactory("MockZkBridge");
        const mockZkBridge = await MockZkBridge.deploy();

        // Deploy all contracts
        const ReputationSender = await ethers.getContractFactory("ReputationSender");
        const sender = await ReputationSender.deploy(
            mockRouter.address,
            mockZkBridge.address,
            sepoliaConfig.addresses.linkToken,
            sepoliaConfig.reputation.decayFactor,
            sepoliaConfig.reputation.minReputationScore
        );

        const ReputationReceiverETH = await ethers.getContractFactory("ReputationReceiverETH");
        const receiverETH = await ReputationReceiverETH.deploy(
            sepoliaConfig.reputation.maxMintAmount
        );

        const ReputationReceiverBSC = await ethers.getContractFactory("ReputationReceiverBSC");
        const receiverBSC = await ReputationReceiverBSC.deploy(
            bscConfig.reputation.maxMintAmount
        );

        const ReputationReceiverZK = await ethers.getContractFactory("ReputationReceiverZK");
        const receiverZK = await ReputationReceiverZK.deploy(
            zkSyncConfig.reputation.maxMintAmount,
            mockZkBridge.address
        );

        // Setup authorizations
        await sender.authorizeChain(sepoliaConfig.chainSelectors.sepolia);
        await sender.authorizeChain(bscConfig.chainSelectors.bscTestnet);
        await sender.authorizeChain(zkSyncConfig.chainSelectors.zksync);
        
        await receiverETH.authorizeSourceChain(sepoliaConfig.chainSelectors.sepolia);
        await receiverBSC.authorizeSourceChain(sepoliaConfig.chainSelectors.sepolia);
        await receiverZK.authorizeSourceChain(sepoliaConfig.chainSelectors.sepolia);

        return { 
            sender, 
            receiverETH, 
            receiverBSC,
            receiverZK,
            mockRouter,
            mockZkBridge,
            owner, 
            user1, 
            user2,
            sepoliaConfig,
            bscConfig,
            zkSyncConfig
        };
    }

    describe("Cross-Chain Reputation Flow", function () {
        it("Should handle complete reputation transfer flow", async function () {
            const { 
                sender, 
                receiverETH, 
                receiverBSC,
                user1,
                sepoliaConfig,
                bscConfig 
            } = await loadFixture(deployFullSystemFixture);

            // Initial reputation minting
            const initialAmount = ethers.utils.parseEther("1000");
            await sender.mintReputation(user1.address, initialAmount);

            // Check initial reputation
            expect(await sender.reputationScores(user1.address))
                .to.equal(initialAmount);

            // Send to ETH receiver
            const ethTransferAmount = ethers.utils.parseEther("300");
            await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                ethTransferAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Send to BSC receiver
            const bscTransferAmount = ethers.utils.parseEther("200");
            await sender.connect(user1).sendReputation(
                bscConfig.chainSelectors.bscTestnet,
                user1.address,
                bscTransferAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Verify final balances
            expect(await sender.reputationScores(user1.address))
                .to.equal(initialAmount.sub(ethTransferAmount).sub(bscTransferAmount));
        });

        it("Should maintain reputation consistency across chains", async function () {
            const { sender, receiverETH, receiverBSC, user1, sepoliaConfig } = await loadFixture(deployFullSystemFixture);

            const amount = ethers.utils.parseEther("500");
            await sender.mintReputation(user1.address, amount);

            // Simulate transfers to both chains
            const transferAmount = ethers.utils.parseEther("100");
            
            // Transfer to ETH
            await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                transferAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Verify total supply consistency
            const senderBalance = await sender.reputationScores(user1.address);
            const ethBalance = await receiverETH.balanceOf(user1.address);
            const bscBalance = await receiverBSC.balanceOf(user1.address);

            expect(senderBalance.add(ethBalance).add(bscBalance))
                .to.equal(amount);
        });
    });

    describe("Reputation Management Features", function () {
        it("Should handle reputation decay consistently", async function () {
            const { sender, user1 } = await loadFixture(deployFullSystemFixture);
            
            const amount = ethers.utils.parseEther("1000");
            await sender.mintReputation(user1.address, amount);

            // Advance time
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");

            const decayedScore = await sender.calculateReputationScore(user1.address);
            expect(decayedScore).to.be.lt(amount);
        });

        it("Should enforce daily limits across chains", async function () {
            const { sender, user1, sepoliaConfig, bscConfig } = await loadFixture(deployFullSystemFixture);
            
            const amount = ethers.utils.parseEther("2000");
            await sender.mintReputation(user1.address, amount);

            // Try to exceed daily limit
            const largeAmount = ethers.utils.parseEther("1500");
            await expect(
                sender.connect(user1).sendReputation(
                    sepoliaConfig.chainSelectors.sepolia,
                    user1.address,
                    largeAmount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ).to.be.revertedWith("Daily limit exceeded");
        });
    });

    describe("Security and Recovery", function () {
        it("Should handle emergency stops system-wide", async function () {
            const { sender, receiverETH, receiverBSC, owner } = await loadFixture(deployFullSystemFixture);
            
            // Emergency pause
            await sender.connect(owner).pause();
            await receiverETH.connect(owner).pause();
            await receiverBSC.connect(owner).pause();

            expect(await sender.paused()).to.be.true;
            expect(await receiverETH.paused()).to.be.true;
            expect(await receiverBSC.paused()).to.be.true;
        });

        it("Should maintain security thresholds across chains", async function () {
            const { sender, user1, sepoliaConfig } = await loadFixture(deployFullSystemFixture);
            
            const amount = ethers.utils.parseEther("50");
            await sender.mintReputation(user1.address, amount);

            // Verify minimum reputation requirement
            const tinyAmount = ethers.utils.parseEther("0.01");
            await expect(
                sender.connect(user1).sendReputation(
                    sepoliaConfig.chainSelectors.sepolia,
                    user1.address,
                    tinyAmount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ).to.be.revertedWith("Amount below minimum");
        });
    });

    describe("Three-Chain Integration", function () {
        it("Should handle complete three-chain transfer flow", async function () {
            const { 
                sender, 
                receiverETH, 
                receiverBSC,
                receiverZK,
                user1,
                sepoliaConfig,
                bscConfig,
                zkSyncConfig 
            } = await loadFixture(deployFullSystemFixture);

            // Initial reputation minting
            const initialAmount = ethers.utils.parseEther("1000");
            await sender.mintReputation(user1.address, initialAmount);

            // Send to ETH receiver
            const ethAmount = ethers.utils.parseEther("300");
            await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                ethAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Send to BSC receiver
            const bscAmount = ethers.utils.parseEther("200");
            await sender.connect(user1).sendReputation(
                bscConfig.chainSelectors.bscTestnet,
                user1.address,
                bscAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Send to zkSync receiver
            const zkAmount = ethers.utils.parseEther("100");
            await sender.connect(user1).sendReputation(
                zkSyncConfig.chainSelectors.zksync,
                user1.address,
                zkAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Verify balances across all chains
            expect(await sender.reputationScores(user1.address))
                .to.equal(initialAmount.sub(ethAmount).sub(bscAmount).sub(zkAmount));
            expect(await receiverETH.balanceOf(user1.address)).to.equal(ethAmount);
            expect(await receiverBSC.balanceOf(user1.address)).to.equal(bscAmount);
            expect(await receiverZK.balanceOf(user1.address)).to.equal(zkAmount);
        });

        it("Should enforce global daily limits across chains", async function () {
            const { 
                sender,
                user1,
                sepoliaConfig,
                bscConfig,
                zkSyncConfig
            } = await loadFixture(deployFullSystemFixture);

            const dailyLimit = ethers.utils.parseEther("500");
            await sender.setGlobalDailyLimit(dailyLimit);

            // Mint initial amount
            const initialAmount = ethers.utils.parseEther("1000");
            await sender.mintReputation(user1.address, initialAmount);

            // Try to exceed daily limit across chains
            const amount = dailyLimit.add(ethers.utils.parseEther("100"));
            
            // First transfer should succeed
            await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                dailyLimit,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Second transfer should fail due to global limit
            await expect(
                sender.connect(user1).sendReputation(
                    bscConfig.chainSelectors.bscTestnet,
                    user1.address,
                    ethers.utils.parseEther("100"),
                    { value: ethers.utils.parseEther("0.1") }
                )
            ).to.be.revertedWith("Global daily limit exceeded");
        });

        it("Should handle emergency stops across all chains", async function () {
            const { 
                sender, 
                receiverETH, 
                receiverBSC, 
                receiverZK,
                owner 
            } = await loadFixture(deployFullSystemFixture);
            
            // Emergency pause all chains
            await sender.connect(owner).pauseAllChains();
            
            expect(await sender.paused()).to.be.true;
            expect(await receiverETH.paused()).to.be.true;
            expect(await receiverBSC.paused()).to.be.true;
            expect(await receiverZK.paused()).to.be.true;
            
            // Try operations while paused
            await expect(
                sender.mintReputation(owner.address, ethers.utils.parseEther("100"))
            ).to.be.revertedWith("Pausable: paused");
        });
    });

    describe("Advanced Security Features", function () {
        it("Should prevent cross-chain replay attacks", async function () {
            const { 
                sender, 
                receiverETH, 
                receiverBSC, 
                receiverZK,
                user1,
                sepoliaConfig 
            } = await loadFixture(deployFullSystemFixture);

            const amount = ethers.utils.parseEther("100");
            await sender.mintReputation(user1.address, amount);

            // First transfer
            const tx = await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                amount.div(2),
                { value: ethers.utils.parseEther("0.1") }
            );
            const receipt = await tx.wait();

            // Try to replay the same transaction on BSC
            const message = {
                sourceChainSelector: sepoliaConfig.chainSelectors.sepolia,
                sender: ethers.utils.defaultAbiCoder.encode(["address"], [sender.address]),
                data: receipt.logs[0].data,
                destAddress: receiverBSC.address,
                nonce: receipt.nonce
            };

            await expect(
                receiverBSC.ccipReceive(
                    message.sourceChainSelector,
                    message.sender,
                    message.destAddress,
                    message.nonce,
                    message.data
                )
            ).to.be.revertedWith("Invalid nonce");
        });

        it("Should handle concurrent transfers across chains", async function () {
            const { 
                sender, 
                user1,
                sepoliaConfig,
                bscConfig,
                zkSyncConfig 
            } = await loadFixture(deployFullSystemFixture);

            const amount = ethers.utils.parseEther("300");
            await sender.mintReputation(user1.address, amount);

            // Setup concurrent transfers
            const transferAmount = ethers.utils.parseEther("100");
            const transfers = [
                sender.connect(user1).sendReputation(
                    sepoliaConfig.chainSelectors.sepolia,
                    user1.address,
                    transferAmount,
                    { value: ethers.utils.parseEther("0.1") }
                ),
                sender.connect(user1).sendReputation(
                    bscConfig.chainSelectors.bscTestnet,
                    user1.address,
                    transferAmount,
                    { value: ethers.utils.parseEther("0.1") }
                ),
                sender.connect(user1).sendReputation(
                    zkSyncConfig.chainSelectors.zksync,
                    user1.address,
                    transferAmount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ];

            // Execute all transfers concurrently
            await Promise.all(transfers);

            // Verify final balance
            expect(await sender.reputationScores(user1.address)).to.equal(0);
        });

        it("Should enforce rate limiting across chains", async function () {
            const { sender, user1, sepoliaConfig } = await loadFixture(deployFullSystemFixture);
            
            const amount = ethers.utils.parseEther("1000");
            await sender.mintReputation(user1.address, amount);

            // Set rate limit
            const rateLimit = 5; // 5 transfers per minute
            await sender.setTransferRateLimit(rateLimit);

            // Try to exceed rate limit
            const smallAmount = ethers.utils.parseEther("10");
            for(let i = 0; i < rateLimit; i++) {
                await sender.connect(user1).sendReputation(
                    sepoliaConfig.chainSelectors.sepolia,
                    user1.address,
                    smallAmount,
                    { value: ethers.utils.parseEther("0.1") }
                );
            }

            // Next transfer should fail
            await expect(
                sender.connect(user1).sendReputation(
                    sepoliaConfig.chainSelectors.sepolia,
                    user1.address,
                    smallAmount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ).to.be.revertedWith("Rate limit exceeded");
        });
    });

    describe("Advanced Integration Tests", function () {
        it("Should handle multi-chain recovery scenario", async function () {
            const { 
                sender,
                receiverETH,
                receiverBSC,
                receiverZK,
                owner 
            } = await loadFixture(deployFullSystemFixture);

            // Setup recovery coordinator
            await sender.setRecoveryCoordinator(owner.address);
            
            // Simulate system-wide issue
            await receiverETH.connect(owner).pause();
            await receiverBSC.connect(owner).pause();
            await receiverZK.connect(owner).pause();

            // Initiate recovery mode
            await sender.connect(owner).initiateRecoveryMode();
            
            // Verify all chains in recovery mode
            expect(await sender.isInRecoveryMode()).to.be.true;
            expect(await receiverETH.isInRecoveryMode()).to.be.true;
            expect(await receiverBSC.isInRecoveryMode()).to.be.true;
            expect(await receiverZK.isInRecoveryMode()).to.be.true;

            // Execute recovery
            await sender.connect(owner).executeRecoveryPlan();
            
            // Verify system restored
            expect(await sender.isInRecoveryMode()).to.be.false;
        });

        it("Should handle cross-chain state synchronization", async function () {
            const { 
                sender,
                receiverETH,
                receiverBSC,
                receiverZK,
                user1,
                sepoliaConfig,
                bscConfig,
                zkSyncConfig
            } = await loadFixture(deployFullSystemFixture);

            const amount = ethers.utils.parseEther("300");
            await sender.mintReputation(user1.address, amount);

            // Send to all chains simultaneously
            const perChainAmount = amount.div(3);
            
            await Promise.all([
                sender.connect(user1).sendReputation(
                    sepoliaConfig.chainSelectors.sepolia,
                    user1.address,
                    perChainAmount,
                    { value: ethers.utils.parseEther("0.1") }
                ),
                sender.connect(user1).sendReputation(
                    bscConfig.chainSelectors.bscTestnet,
                    user1.address,
                    perChainAmount,
                    { value: ethers.utils.parseEther("0.1") }
                ),
                sender.connect(user1).sendReputation(
                    zkSyncConfig.chainSelectors.zksync,
                    user1.address,
                    perChainAmount,
                    { value: ethers.utils.parseEther("0.1") }
                )
            ]);

            // Verify state consistency
            const totalSupply = await sender.totalSupply();
            const ethSupply = await receiverETH.totalSupply();
            const bscSupply = await receiverBSC.totalSupply();
            const zkSupply = await receiverZK.totalSupply();

            expect(totalSupply.add(ethSupply).add(bscSupply).add(zkSupply))
                .to.equal(amount);
        });
    });

    describe("Error Recovery and Management", function () {
        it("Should recover from failed cross-chain transfers", async function () {
            const { 
                sender, 
                receiverETH,
                user1,
                sepoliaConfig 
            } = await loadFixture(deployFullSystemFixture);

            const amount = ethers.utils.parseEther("100");
            await sender.mintReputation(user1.address, amount);

            // Simulate failed transfer by pausing receiver
            await receiverETH.pause();
            
            const failedTx = await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                amount.div(2),
                { value: ethers.utils.parseEther("0.1") }
            );

            // Initiate recovery
            await sender.initiateTransferRecovery(failedTx.hash);
            
            // Unpause and retry
            await receiverETH.unpause();
            await sender.retryFailedTransfer(failedTx.hash);

            expect(await receiverETH.balanceOf(user1.address))
                .to.equal(amount.div(2));
        });

        it("Should handle multi-chain failure recovery", async function () {
            const { 
                sender, 
                receiverETH,
                receiverBSC,
                user1,
                sepoliaConfig,
                bscConfig 
            } = await loadFixture(deployFullSystemFixture);

            const amount = ethers.utils.parseEther("300");
            await sender.mintReputation(user1.address, amount);

            // Simulate chain failures
            await receiverETH.pause();
            await receiverBSC.pause();

            // Record failed transfers
            const failedTransfers = [];
            
            // Attempt transfers to both chains
            const transferAmount = ethers.utils.parseEther("100");
            
            const ethTx = await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                transferAmount,
                { value: ethers.utils.parseEther("0.1") }
            );
            failedTransfers.push(ethTx.hash);

            const bscTx = await sender.connect(user1).sendReputation(
                bscConfig.chainSelectors.bscTestnet,
                user1.address,
                transferAmount,
                { value: ethers.utils.parseEther("0.1") }
            );
            failedTransfers.push(bscTx.hash);

            // Initiate batch recovery
            await sender.initiateBatchRecovery(failedTransfers);
            
            // Restore chains and retry
            await receiverETH.unpause();
            await receiverBSC.unpause();
            await sender.retryBatchTransfers(failedTransfers);

            // Verify recovery
            expect(await receiverETH.balanceOf(user1.address))
                .to.equal(transferAmount);
            expect(await receiverBSC.balanceOf(user1.address))
                .to.equal(transferAmount);
        });

        it("Should maintain system integrity during recovery", async function () {
            const { 
                sender, 
                receiverETH,
                user1,
                sepoliaConfig 
            } = await loadFixture(deployFullSystemFixture);

            const initialAmount = ethers.utils.parseEther("500");
            await sender.mintReputation(user1.address, initialAmount);

            // Track initial state
            const initialSystemState = {
                senderBalance: await sender.reputationScores(user1.address),
                receiverBalance: await receiverETH.balanceOf(user1.address)
            };

            // Simulate failed transfer
            await receiverETH.pause();
            
            const failedAmount = ethers.utils.parseEther("200");
            const failedTx = await sender.connect(user1).sendReputation(
                sepoliaConfig.chainSelectors.sepolia,
                user1.address,
                failedAmount,
                { value: ethers.utils.parseEther("0.1") }
            );

            // Verify system state during failure
            expect(await sender.reputationScores(user1.address))
                .to.equal(initialSystemState.senderBalance.sub(failedAmount));
            expect(await receiverETH.balanceOf(user1.address))
                .to.equal(initialSystemState.receiverBalance);

            // Recover and verify final state
            await receiverETH.unpause();
            await sender.retryFailedTransfer(failedTx.hash);

            expect(await sender.reputationScores(user1.address))
                .to.equal(initialSystemState.senderBalance.sub(failedAmount));
            expect(await receiverETH.balanceOf(user1.address))
                .to.equal(initialSystemState.receiverBalance.add(failedAmount));
        });
    });
});