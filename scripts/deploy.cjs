const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("            VEILX DEPLOYMENT TO ETHEREUM SEPOLIA");
  console.log("=".repeat(70) + "\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    throw new Error("Deployer has no ETH! Fund with Sepolia ETH from faucet.");
  }

  console.log("Phase 1: Deploying ConfidentialNFT...");
  console.log("-".repeat(50));
  
  const ConfidentialNFT = await ethers.getContractFactory("ConfidentialNFT");
  const nft = await ConfidentialNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("ConfidentialNFT deployed to:", nftAddress);
  
  const deployTx = nft.deploymentTransaction();
  if (deployTx) {
    console.log("Transaction hash:", deployTx.hash);
    const receipt = await deployTx.wait();
    console.log("Gas used:", receipt?.gasUsed.toString());
  }

  console.log("\nPhase 2: Deploying ConfidentialMarketplace...");
  console.log("-".repeat(50));
  
  const ConfidentialMarketplace = await ethers.getContractFactory("ConfidentialMarketplace");
  const marketplace = await ConfidentialMarketplace.deploy(nftAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("ConfidentialMarketplace deployed to:", marketplaceAddress);
  
  const marketplaceTx = marketplace.deploymentTransaction();
  if (marketplaceTx) {
    console.log("Transaction hash:", marketplaceTx.hash);
    const receipt = await marketplaceTx.wait();
    console.log("Gas used:", receipt?.gasUsed.toString());
  }

  console.log("\nPhase 3: Deploying CollectionRegistry...");
  console.log("-".repeat(50));
  
  const CollectionRegistry = await ethers.getContractFactory("CollectionRegistry");
  const registry = await CollectionRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("CollectionRegistry deployed to:", registryAddress);
  
  const registryTx = registry.deploymentTransaction();
  if (registryTx) {
    console.log("Transaction hash:", registryTx.hash);
    const receipt = await registryTx.wait();
    console.log("Gas used:", receipt?.gasUsed.toString());
  }

  console.log("\nPhase 4: Linking contracts...");
  console.log("-".repeat(50));
  
  console.log("Setting marketplace on NFT contract...");
  const setMarketplaceTx = await nft.setMarketplace(marketplaceAddress);
  await setMarketplaceTx.wait();
  console.log("Marketplace set successfully");
  
  const storedMarketplace = await nft.marketplace();
  console.log("Verified: NFT.marketplace =", storedMarketplace);

  console.log("\nPhase 5: Verifying deployment...");
  console.log("-".repeat(50));
  
  const nftName = await nft.name();
  const nftSymbol = await nft.symbol();
  const nftOwner = await nft.owner();
  const marketplaceOwner = await marketplace.owner();
  const linkedNft = await marketplace.nftContract();
  
  console.log("NFT Name:", nftName);
  console.log("NFT Symbol:", nftSymbol);
  console.log("NFT Contract Owner:", nftOwner);
  console.log("Marketplace Owner:", marketplaceOwner);
  console.log("Marketplace linked to NFT:", linkedNft);
  
  const registryOwner = await registry.owner();
  
  const verification = {
    nftContractValid: nftOwner === deployer.address,
    marketplaceContractValid: marketplaceOwner === deployer.address,
    registryContractValid: registryOwner === deployer.address,
    contractsLinked: linkedNft === nftAddress && storedMarketplace === marketplaceAddress,
  };
  
  console.log("\nVerification Results:");
  console.log("  NFT owner matches deployer:", verification.nftContractValid);
  console.log("  Marketplace owner matches deployer:", verification.marketplaceContractValid);
  console.log("  Registry owner matches deployer:", verification.registryContractValid);
  console.log("  Contracts properly linked:", verification.contractsLinked);

  const deploymentResult = {
    network: network.name || "sepolia",
    chainId: Number(network.chainId),
    deployer: deployer.address,
    nftAddress,
    marketplaceAddress,
    registryAddress,
    timestamp: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, `${network.name || "sepolia"}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentResult, null, 2));
  console.log("\nDeployment saved to:", deploymentFile);

  console.log("\n" + "=".repeat(70));
  console.log("                  DEPLOYMENT COMPLETE");
  console.log("=".repeat(70));
  console.log("\nContract Addresses:");
  console.log("  ConfidentialNFT:         ", nftAddress);
  console.log("  ConfidentialMarketplace: ", marketplaceAddress);
  console.log("  CollectionRegistry:      ", registryAddress);
  console.log("\nEnvironment Variables (add to .env or Replit Secrets):");
  console.log(`  VITE_NFT_CONTRACT_ADDRESS=${nftAddress}`);
  console.log(`  VITE_MARKETPLACE_ADDRESS=${marketplaceAddress}`);
  console.log(`  VITE_COLLECTION_REGISTRY_ADDRESS=${registryAddress}`);
  console.log("\nEtherscan Links:");
  console.log(`  NFT: https://sepolia.etherscan.io/address/${nftAddress}`);
  console.log(`  Marketplace: https://sepolia.etherscan.io/address/${marketplaceAddress}`);
  console.log(`  Registry: https://sepolia.etherscan.io/address/${registryAddress}`);
  console.log("=".repeat(70) + "\n");

  return deploymentResult;
}

main()
  .then((result) => {
    console.log("Deployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed:", error);
    process.exit(1);
  });
