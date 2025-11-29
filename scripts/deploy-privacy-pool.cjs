const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting PrivacyPool contract deployment on Sepolia...");
  
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  
  console.log(`📍 Deployer address: ${deployerAddress}`);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther("0.005")) {
    console.error("❌ Insufficient balance for deployment. Need at least 0.005 ETH");
    process.exit(1);
  }
  
  console.log("\n📦 Deploying PrivacyPool...");
  const PrivacyPool = await ethers.getContractFactory("PrivacyPool");
  const pool = await PrivacyPool.deploy();
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log(`✅ PrivacyPool deployed at: ${poolAddress}`);
  
  console.log("\n🔗 Setting relayer address on PrivacyPool...");
  const setRelayerTx = await pool.setRelayer(deployerAddress);
  await setRelayerTx.wait();
  console.log(`✅ Relayer set to deployer address: ${deployerAddress}`);
  
  const deploymentPath = path.join(__dirname, "..", "deployments", "sepolia.json");
  let deployment = {};
  if (fs.existsSync(deploymentPath)) {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }
  
  deployment.privacyPoolAddress = poolAddress;
  deployment.privacyPoolDeployedAt = new Date().toISOString();
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n📄 Deployment info updated in: ${deploymentPath}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 PRIVACY POOL DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log(`\n📋 Contract Address:`);
  console.log(`   PrivacyPool: ${poolAddress}`);
  console.log("\n📝 Update your environment with:");
  console.log(`   VITE_PRIVACY_POOL_ADDRESS=${poolAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
