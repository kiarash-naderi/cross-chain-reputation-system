const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReputationSystem", function () {
  let reputationToken;
  let reputationSender;
  let reputationReceiverETH;
  let reputationReceiverBSC;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy();
    await reputationToken.deployed();

    const ReputationSender = await ethers.getContractFactory("ReputationSender");
    reputationSender = await ReputationSender.deploy(reputationToken.address);
    await reputationSender.deployed();

    const ReputationReceiverETH = await ethers.getContractFactory("ReputationReceiverETH");
    reputationReceiverETH = await ReputationReceiverETH.deploy();
    await reputationReceiverETH.deployed();

    const ReputationReceiverBSC = await ethers.getContractFactory("ReputationReceiverBSC");
    reputationReceiverBSC = await ReputationReceiverBSC.deploy();
    await reputationReceiverBSC.deployed();
  });

  it("should mint initial tokens to the owner", async function () {
    const balance = await reputationToken.balanceOf(owner.address);
    expect(balance).to.equal(ethers.utils.parseUnits("1000000", 18));
  });

  it("should allow cross-chain transfers to Ethereum Sepolia", async function () {
    const amount = ethers.utils.parseUnits("100", 18);
    await reputationToken.transfer(user1.address, amount);
    await reputationToken.connect(user1).approve(reputationSender.address, amount);

    const dstChainId = 1; // Ethereum Sepolia chain ID
    const dstContract = reputationReceiverETH.address;

    await expect(reputationSender.connect(user1).sendReputation(user2.address, amount, dstChainId, dstContract))
      .to.emit(reputationSender, "CCIPSendRequested")
      .withArgs(dstChainId, dstContract, ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [user2.address, amount]), user1.address);

    const balance = await reputationToken.balanceOf(user1.address);
    expect(balance).to.equal(0);
  });

  it("should allow cross-chain transfers to BSC Testnet", async function () {
    const amount = ethers.utils.parseUnits("100", 18);
    await reputationToken.transfer(user1.address, amount);
    await reputationToken.connect(user1).approve(reputationSender.address, amount);

    const dstChainId = 97; // BSC Testnet chain ID
    const dstContract = reputationReceiverBSC.address;

    await expect(reputationSender.connect(user1).sendReputation(user2.address, amount, dstChainId, dstContract))
      .to.emit(reputationSender, "CCIPSendRequested")
      .withArgs(dstChainId, dstContract, ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [user2.address, amount]), user1.address);

    const balance = await reputationToken.balanceOf(user1.address);
    expect(balance).to.equal(0);
  });

  it("should mint tokens on receiving chain after cross-chain transfer", async function () {
    const amount = ethers.utils.parseUnits("100", 18);
    await reputationToken.transfer(user1.address, amount);
    await reputationToken.connect(user1).approve(reputationSender.address, amount);

    const dstChainId = 1; // Ethereum Sepolia chain ID
    const dstContract = reputationReceiverETH.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [user2.address, amount]);

    await reputationSender.connect(user1).sendReputation(user2.address, amount, dstChainId, dstContract);

    await expect(reputationReceiverETH.ccipReceive(dstChainId, user1.address, user2.address, 1, payload))
      .to.emit(reputationReceiverETH, "CCIPReceived")
      .withArgs(dstChainId, user1.address, user2.address, 1, payload);

    const balance = await reputationReceiverETH.balanceOf(user2.address);
    expect(balance).to.equal(amount);
  });
});