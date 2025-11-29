const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying CollectionFactory contract...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
  console.log("Deploying CollectionFactory...");
  
  const factory = await CollectionFactory.deploy();
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("CollectionFactory deployed to:", factoryAddress);
  
  const deploymentFee = await factory.deploymentFee();
  console.log("Deployment fee:", ethers.formatEther(deploymentFee), "ETH");
  
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log(`CollectionFactory: ${factoryAddress}`);
  console.log("\nAdd this to your .env file:");
  console.log(`VITE_COLLECTION_FACTORY_ADDRESS=${factoryAddress}`);
  console.log("\nVerify on Etherscan:");
  console.log(`npx hardhat verify --network sepolia ${factoryAddress}`);
  console.log("========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
