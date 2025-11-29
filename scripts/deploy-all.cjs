const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting VeilX contract deployment on Sepolia...");
  
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  
  console.log(`📍 Deployer address: ${deployerAddress}`);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.01")) {
    console.error("❌ Insufficient balance for deployment. Need at least 0.01 ETH");
    process.exit(1);
  }
  
  console.log("\n📦 Deploying ConfidentialNFT...");
  const ConfidentialNFT = await ethers.getContractFactory("ConfidentialNFT");
  const nft = await ConfidentialNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`✅ ConfidentialNFT deployed at: ${nftAddress}`);
  
  console.log("\n📦 Deploying ConfidentialMarketplace...");
  const ConfidentialMarketplace = await ethers.getContractFactory("ConfidentialMarketplace");
  const marketplace = await ConfidentialMarketplace.deploy(nftAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`✅ ConfidentialMarketplace deployed at: ${marketplaceAddress}`);
  
  console.log("\n🔗 Setting marketplace on NFT contract...");
  const setMarketplaceTx = await nft.setMarketplace(marketplaceAddress);
  await setMarketplaceTx.wait();
  console.log(`✅ Marketplace set successfully`);
  
  console.log("\n📦 Deploying CollectionFactory...");
  const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
  const factory = await CollectionFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ CollectionFactory deployed at: ${factoryAddress}`);
  
  const deployment = {
    network: "sepolia",
    chainId: 11155111,
    deployer: deployerAddress,
    nftAddress: nftAddress,
    marketplaceAddress: marketplaceAddress,
    collectionFactoryAddress: factoryAddress,
    timestamp: new Date().toISOString(),
  };
  
  const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia.json");
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n📄 Deployment info saved to: ${deploymentPath}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log(`\n📋 Contract Addresses:`);
  console.log(`   ConfidentialNFT:       ${nftAddress}`);
  console.log(`   ConfidentialMarketplace: ${marketplaceAddress}`);
  console.log(`   CollectionFactory:     ${factoryAddress}`);
  console.log("\n📝 Update your .env file with these addresses:");
  console.log(`   VITE_NFT_CONTRACT_ADDRESS=${nftAddress}`);
  console.log(`   VITE_MARKETPLACE_ADDRESS=${marketplaceAddress}`);
  console.log(`   VITE_COLLECTION_FACTORY_ADDRESS=${factoryAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
