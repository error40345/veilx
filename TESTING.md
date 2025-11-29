# VeilX Testing Guide

This document provides comprehensive testing instructions for the VeilX privacy-preserving NFT marketplace.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Smart Contract Testing](#smart-contract-testing)
- [Running the Application](#running-the-application)
- [End-to-End Testing](#end-to-end-testing)
- [Privacy Verification](#privacy-verification)
- [Test Checklist](#test-checklist)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

1. **Node.js 18+**: Required for running the application
2. **MetaMask**: Browser wallet extension
3. **Sepolia ETH**: Get test ETH from [Sepolia Faucet](https://sepoliafaucet.com)

### Environment Setup

```bash
# Clone the repository
git clone https://github.com/your-repo/veilx.git
cd veilx

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values:
# - DATABASE_URL: PostgreSQL connection string
# - DEPLOYER_PRIVATE_KEY: For contract deployment
# - RELAYER_PRIVATE_KEY: For relayer wallet
```

---

## Smart Contract Testing

### Compile Contracts

```bash
npx hardhat compile
```

Expected output:
```
Compiled 5 Solidity files successfully
```

### Verify Deployed Contracts

The contracts are already deployed on Sepolia. You can verify them here:

| Contract | Address | Etherscan |
|----------|---------|-----------|
| CollectionFactory | `0x15bc27140f84fFcDc994C4c2878a7d8A27FE76D3` | [View](https://sepolia.etherscan.io/address/0x15bc27140f84fFcDc994C4c2878a7d8A27FE76D3) |
| PrivacyPool | `0xD6295bd696734DbA6455E3Be2e10616C27F72f7F` | [View](https://sepolia.etherscan.io/address/0xD6295bd696734DbA6455E3Be2e10616C27F72f7F) |
| ConfidentialNFT | `0x91C94eA6c08c762C5475d2037bf45F3B8c9C80D9` | [View](https://sepolia.etherscan.io/address/0x91C94eA6c08c762C5475d2037bf45F3B8c9C80D9) |
| ConfidentialMarketplace | `0xE8660238894c8a594844A8bB4efD760c6760D7be` | [View](https://sepolia.etherscan.io/address/0xE8660238894c8a594844A8bB4efD760c6760D7be) |

### Deploy New Contracts (Optional)

If you want to deploy your own contracts:

```bash
# Set your private key
export DEPLOYER_PRIVATE_KEY="your_private_key"

# Deploy all contracts
npx hardhat run scripts/deploy-all.cjs --network sepolia
```

---

## Running the Application

### Start Development Server

```bash
npm run dev
```

The application will start on `http://localhost:5000`

### Verify Application is Running

1. Open `http://localhost:5000` in your browser
2. You should see the VeilX homepage with:
   - Navigation bar
   - Hero section
   - Market statistics
   - NFT grid

---

## End-to-End Testing

### Test Flow: Complete NFT Lifecycle

Follow these steps in order to test all core functionality:

#### Step 1: Connect Wallet
1. Open the application at `http://localhost:5000`
2. Click **"Connect Wallet"** in the navbar
3. Approve the MetaMask connection
4. Verify your wallet address appears (truncated) in the navbar

**Expected Result**: Wallet icon shows connected state with your address

#### Step 2: Deposit to Privacy Pool
1. Click the **wallet/pool icon** in the navbar
2. In the modal, enter an amount (e.g., `0.05` ETH)
3. Click **"Deposit"**
4. Sign the message in MetaMask when prompted
5. Wait for the transaction to confirm (10-20 seconds)

**Expected Result**: 
- Pool balance shows your deposited amount
- Transaction visible on [Sepolia Etherscan](https://sepolia.etherscan.io)

#### Step 3: Create a Collection
1. Click **"Launch Collection"** button
2. Fill in the form:
   - Name: `Test Collection`
   - Symbol: `TEST`
   - Total Supply: `100`
   - Mint Price: `0.001` ETH
3. Click **"Create"**
4. Wait for transaction confirmation

**Expected Result**:
- Collection appears on the Collections page
- Contract deployed on Sepolia

#### Step 4: Mint an NFT
1. Navigate to your collection (Collections page)
2. Click **"Mint"** on the collection card
3. Confirm the mint
4. Wait for transaction confirmation (15-30 seconds due to FHE)

**Expected Result**:
- NFT appears in your Profile
- Pool balance decreased by mint price
- **Privacy Check**: Transaction on Etherscan shows RELAYER address as minter, NOT your address

#### Step 5: List NFT for Sale
1. Go to **Profile** page
2. Find your minted NFT
3. Click **"List"**
4. Enter price (e.g., `0.02` ETH)
5. Confirm listing

**Expected Result**:
- NFT shows "Listed" status in Profile
- NFT visible in Marketplace
- **Privacy Check**: Listing event on Etherscan has NO seller address

#### Step 6: Buy NFT (Different Account)
1. **Switch to a different MetaMask account**
2. Connect the new wallet
3. Deposit ETH to Privacy Pool (at least the NFT price)
4. Browse Marketplace
5. Click **"Buy"** on the listed NFT
6. Confirm purchase

**Expected Result**:
- NFT ownership transferred
- Seller's pool balance increased
- Buyer's pool balance decreased
- **Privacy Check**: Sale event on Etherscan has NO buyer or seller address

---

## Privacy Verification

### How to Verify Encryption is Working

#### 1. Check Transaction Events on Etherscan

After any mint, list, or buy transaction:

1. Copy the transaction hash from the app
2. Go to `https://sepolia.etherscan.io/tx/[TX_HASH]`
3. Click **"Logs"** tab
4. Examine the emitted events

**Expected Event Format (Privacy Preserved):**
```
Event: NFTMinted
├── tokenId: 1
├── mintPrice: 1000000000000000
└── timestamp: 1732900000
    
// NO owner address field!
```

**Traditional NFT (Privacy Exposed - NOT us):**
```
Event: Transfer
├── from: 0x0000000000000000000000000000000000000000
├── to: 0xYourActualAddress  ← EXPOSED!
└── tokenId: 1
```

#### 2. Verify Relayer Pattern

Check that all transactions are submitted by the relayer:

1. Look at any VeilX transaction on Etherscan
2. Check the **"From"** field
3. Should always be: `0xc1436ED728cF8e9765aF580A87786d47C2F27631`

Your actual wallet address should **never** appear as a transaction sender.

#### 3. Verify On-Chain Storage

Use Etherscan's "Read Contract" feature:

1. Go to a collection contract on Etherscan
2. Click **"Read Contract"**
3. Call `ownerOf(tokenId)`
4. Result shows the RELAYER address, not the true owner

The true owner is stored encrypted in `encryptedOwners` mapping (not readable).

---

## Test Checklist

Use this checklist to verify all functionality:

### Core Features
- [ ] Wallet connects successfully
- [ ] Network indicator shows Sepolia
- [ ] Privacy Pool deposit works
- [ ] Privacy Pool balance displays correctly
- [ ] Privacy Pool withdrawal works
- [ ] Collection creation works
- [ ] NFT minting works
- [ ] NFT listing works
- [ ] NFT unlisting works
- [ ] NFT purchasing works
- [ ] Offer creation works
- [ ] Offer cancellation works
- [ ] Offer acceptance works

### Privacy Verification
- [ ] Transaction events contain NO user addresses
- [ ] Relayer address used for all on-chain transactions
- [ ] `ownerOf()` returns relayer address
- [ ] Encrypted owner data in contract storage

### UI/UX
- [ ] Loading states shown during operations
- [ ] Error messages display properly
- [ ] Transaction confirmations shown
- [ ] Encryption badges visible on NFT cards
- [ ] Responsive design works on mobile

---

## Troubleshooting

### Common Issues

#### "Insufficient Pool Balance"
**Cause**: Privacy Pool balance too low for the operation  
**Solution**: Deposit more ETH to the Privacy Pool

#### "Transaction Failed"
**Cause**: Relayer out of gas or network congestion  
**Solution**: 
1. Wait a few seconds and retry
2. Check relayer wallet balance on Etherscan
3. Check Sepolia network status

#### "Wallet Not Connected"
**Cause**: MetaMask not connected or wrong network  
**Solution**: 
1. Click "Connect Wallet" again
2. Ensure MetaMask is on Sepolia network

#### "FHE Encryption Failed"
**Cause**: Zama gateway issue  
**Solution**: 
1. Check browser console for errors
2. Refresh the page
3. Retry the operation

#### Long Transaction Times
**Cause**: FHE operations are computationally expensive  
**Expected Times**:
- Deposit: 10-20 seconds
- Mint: 15-30 seconds
- List: 10-15 seconds
- Buy: 30-45 seconds

### Checking Application Logs

If running locally, check the terminal for detailed logs:

```
[Relayer] Transaction submitted: 0x...
[Relayer] Transaction confirmed in block: ...
[FHEVM Server] Encryption successful
[Pool] Deduction confirmed
```

---

## Verified Transaction Examples

Here are real transactions demonstrating privacy features:

| Operation | Transaction Hash | Privacy Verified |
|-----------|-----------------|------------------|
| Mint | `0xc98006c54ef65805dc5348c93d4a14e71dcbc93db891ca11998ee63023fc84c3` | No owner in event |
| List | `0x7caa35b809214809201795dbee90e82425b11082f3b616ed9e6e1d8bc8fbceda` | No seller in event |
| Buy | `0x600bbf8575eef7d0c316ac76fdb90e27bfb38e145f4d3aa2db04033956fb05f2` | No buyer/seller in event |

View these on [Sepolia Etherscan](https://sepolia.etherscan.io) to verify the privacy claims.

---

**Happy Testing!**
