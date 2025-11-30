# VeilX - Privacy-Preserving NFT Marketplace

[![Built with Zama fhEVM](https://img.shields.io/badge/Built%20with-Zama%20fhEVM-blue)](https://docs.zama.ai/fhevm)
[![Deployed on Sepolia](https://img.shields.io/badge/Deployed%20on-Sepolia%20Testnet-green)](https://sepolia.etherscan.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

VeilX is a **fully functional NFT marketplace** that leverages **Zama's Fully Homomorphic Encryption (FHE)** to provide unprecedented privacy for NFT transactions. While traditional NFT marketplaces expose all wallet addresses publicly, VeilX encrypts buyer, seller, and owner identities on-chain, creating a fair marketplace free from whale tracking and front-running.

## Demo Video

> **Watch the full demo**: [YouTube Link - Coming Soon]
>
> The demo video showcases:
> - Wallet connection and Privacy Pool deposit
> - Creating a new NFT collection with encrypted creator identity
> - Minting NFTs with fully private ownership
> - Listing and purchasing NFTs anonymously
> - Verifying privacy on Sepolia Etherscan (no addresses in events)

---

## Live Demo 

### Try It Yourself

**Run Locally:**
```bash
git clone https://github.com/your-repo/veilx.git
cd veilx
npm install
npm run dev
# Open http://localhost:5000
```

**Requirements:**
- MetaMask wallet
- Sepolia testnet ETH ([Get from faucet](https://sepoliafaucet.com))

### Deployed Contracts on Sepolia Testnet

| Contract | Address | Etherscan |
|----------|---------|-----------|
| CollectionFactory | `0x15bc27140f84fFcDc994C4c2878a7d8A27FE76D3` | [View](https://sepolia.etherscan.io/address/0x15bc27140f84fFcDc994C4c2878a7d8A27FE76D3) |
| PrivacyPool | `0xD6295bd696734DbA6455E3Be2e10616C27F72f7F` | [View](https://sepolia.etherscan.io/address/0xD6295bd696734DbA6455E3Be2e10616C27F72f7F) |
| ConfidentialNFT | `0x91C94eA6c08c762C5475d2037bf45F3B8c9C80D9` | [View](https://sepolia.etherscan.io/address/0x91C94eA6c08c762C5475d2037bf45F3B8c9C80D9) |
| ConfidentialMarketplace | `0xE8660238894c8a594844A8bB4efD760c6760D7be` | [View](https://sepolia.etherscan.io/address/0xE8660238894c8a594844A8bB4efD760c6760D7be) |

### Verified Transactions (Privacy Proof)

These real transactions demonstrate that NO addresses are exposed:

| Action | Transaction | Verify |
|--------|-------------|--------|
| Mint NFT | `0xc98006c54ef65805dc5348c93d4a14e71dcbc93db891ca11998ee63023fc84c3` | [View Logs](https://sepolia.etherscan.io/tx/0xc98006c54ef65805dc5348c93d4a14e71dcbc93db891ca11998ee63023fc84c3#eventlog) |
| List NFT | `0x7caa35b809214809201795dbee90e82425b11082f3b616ed9e6e1d8bc8fbceda` | [View Logs](https://sepolia.etherscan.io/tx/0x7caa35b809214809201795dbee90e82425b11082f3b616ed9e6e1d8bc8fbceda#eventlog) |
| Buy NFT | `0x600bbf8575eef7d0c316ac76fdb90e27bfb38e145f4d3aa2db04033956fb05f2` | [View Logs](https://sepolia.etherscan.io/tx/0x600bbf8575eef7d0c316ac76fdb90e27bfb38e145f4d3aa2db04033956fb05f2#eventlog) |

---

## Table of Contents

- [Demo Video] ( https://drive.google.com/file/d/1tliH9Ro30bCK4aJfu31FgljCb0fnU61i/view) ) 
- [Live Demo]  ((https://veilx.beauty/)) https://veilx.beauty/
- [Problem Statement](#problem-statement)
- [Solution: VeilX](#solution-veilx)
- [Architecture](#architecture)
- [Smart Contracts](#smart-contracts)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Testing](#testing)
- [Privacy Features Deep Dive](#privacy-features-deep-dive)
- [Ownership Model & Production Roadmap](#ownership-model--production-roadmap)
- [Business Potential](#business-potential)
- [License](#license)

---

## Problem Statement

Traditional NFT marketplaces like OpenSea expose all transaction data publicly:

| Data Point | Traditional NFT | VeilX |
|------------|-----------------|-------|
| Who owns which NFT | Public | **Encrypted** |
| Who is selling | Public | **Encrypted** |
| Who is buying | Public | **Encrypted** |
| Sale price | Public | Public (for market transparency) |
| Transaction history | Fully traceable | **Identity-anonymous** |

This public exposure leads to:
- **Whale tracking**: Users can see when wealthy collectors buy, leading to copycat behavior
- **Front-running**: Bots can see pending transactions and front-run purchases
- **Privacy invasion**: Anyone can view your entire NFT portfolio
- **Social engineering**: Attackers can target high-value collectors

---

## Solution: VeilX

VeilX solves these problems using **Zama's fhEVM** (Fully Homomorphic Encryption on EVM):

### How It Works

1. **Encrypted Ownership**: Owner addresses are stored as `euint64` (encrypted unsigned integers), not plaintext addresses
2. **Relayer Architecture**: All user transactions go through a relayer, hiding the actual user's wallet address
3. **Privacy Pool**: Users deposit ETH to an anonymous pool, breaking the link between their wallet and NFT purchases
4. **Public Market Data**: Prices, volumes, and NFT metadata remain public for fair market discovery

### What Observers See vs. Reality

**On Blockchain (Public)**:
```
NFT #42 minted - Price: 0.01 ETH - Timestamp: 1732900000
NFT #42 listed - Price: 0.05 ETH - Timestamp: 1732900100  
NFT #42 sold  - Price: 0.05 ETH - Timestamp: 1732900200
```

**On Blockchain (Hidden)**:
```
Owner: [ENCRYPTED - euint64]
Seller: [ENCRYPTED - euint64]
Buyer: [ENCRYPTED - euint64]
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VeilX Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐ │
│  │   Frontend   │────▶│   Backend    │────▶│  Zama fhEVM      │ │
│  │   (React)    │     │  (Express)   │     │  Coprocessor     │ │
│  └──────────────┘     └──────────────┘     └──────────────────┘ │
│         │                    │                      │            │
│         │                    │                      ▼            │
│         │             ┌──────────────┐     ┌──────────────────┐ │
│         │             │   Relayer    │────▶│  Smart Contracts │ │
│         │             │   Wallet     │     │  (Sepolia)       │ │
│         │             └──────────────┘     └──────────────────┘ │
│         │                    │                      │            │
│         ▼                    ▼                      ▼            │
│  ┌──────────────────────────────────────────────────────────────┤
│  │                    Privacy Layer                              │
│  │  • User signs messages (not transactions)                     │
│  │  • Relayer submits transactions (hides user identity)        │
│  │  • FHE encrypts all identity data on-chain                   │
│  │  • Privacy Pool breaks deposit/purchase correlation           │
│  └──────────────────────────────────────────────────────────────┘
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow Diagram

```
User Wallet ──sign message──▶ Backend ──encrypt identity──▶ Relayer ──submit tx──▶ Blockchain
                                  │                                                    │
                                  │                                                    ▼
                                  │                                         Encrypted Owner
                                  │                                         (euint64 on-chain)
                                  │
                                  └──────────── Zama fhEVM SDK ────────────────────────┘
                                               (Server-side encryption)
```

---

## Smart Contracts

### 1. VeilXCollection.sol
**Purpose**: ERC-721-compatible NFT contract with encrypted ownership

**Key Features**:
- `euint64 encryptedOwners` - Stores owner identity encrypted
- `euint64 encryptedSellers` - Stores seller identity encrypted when listed
- Privacy-preserving events (no addresses emitted)
- Offer system with encrypted offerer identities

**FHE Usage**:
```solidity
// Encrypted owner storage
mapping(uint256 => euint64) private encryptedOwners;

// Mint with encrypted owner
function mint(
    string memory tokenUri,
    externalEuint64 encryptedOwnerInput,
    bytes calldata inputProof
) external payable returns (uint256) {
    euint64 encryptedOwner = FHE.fromExternal(encryptedOwnerInput, inputProof);
    FHE.allowThis(encryptedOwner);
    encryptedOwners[tokenId] = encryptedOwner;
    // ...
}
```

### 2. CollectionFactory.sol
**Purpose**: Deploy new NFT collections with encrypted creator identity

**Key Features**:
- Factory pattern for unlimited collections
- `euint64 encryptedCreator` - Creator identity is private
- Collection management (pause, unpause)

### 3. PrivacyPool.sol
**Purpose**: Break correlation between deposits and purchases

**Key Features**:
- Users deposit ETH anonymously
- Purchases are funded from the pool
- No on-chain link between depositor wallet and NFT owner

**FHE Usage**:
```solidity
// Balance tracked by encrypted identity hash
mapping(bytes32 => euint64) private _encryptedBalances;
```

### 4. ConfidentialMarketplace.sol
**Purpose**: Trade NFTs with encrypted buyer/seller

**Key Features**:
- `euint256 encryptedSeller` - Listing seller is encrypted
- `euint256 encryptedBuyer` - Trade buyer is encrypted
- Public pricing for market transparency

### 5. ConfidentialNFT.sol
**Purpose**: Standalone NFT with maximum privacy

**Key Features**:
- `euint256 encryptedOwners` - 256-bit encrypted ownership
- Public `ownerOf()` returns relayer (for ERC-721 compatibility)
- True ownership only accessible via encrypted getter

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Smart Contracts** | Solidity 0.8.24, Zama fhEVM 0.9.x |
| **Encryption** | Zama TFHE (Fully Homomorphic Encryption) |
| **Blockchain** | Ethereum Sepolia Testnet |
| **Frontend** | React, TypeScript, TailwindCSS, shadcn/ui |
| **Backend** | Node.js, Express, PostgreSQL |
| **Wallet** | MetaMask, ethers.js |
| **FHE SDK** | fhevmjs v0.3.0-5 |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MetaMask wallet with Sepolia ETH
- PostgreSQL database

### Environment Variables

Create a `.env` file:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/veilx"

# Blockchain
DEPLOYER_PRIVATE_KEY="your_deployer_private_key"
RELAYER_PRIVATE_KEY="your_relayer_private_key"

# Network
VITE_SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
```

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/veilx.git
cd veilx

# Install dependencies
npm install

# Compile smart contracts
npx hardhat compile

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

### Deployment

```bash
# Deploy all contracts to Sepolia
npx hardhat run scripts/deploy-all.cjs --network sepolia

# Deploy only Collection Factory
npx hardhat run scripts/deploy-factory.cjs --network sepolia

# Deploy only Privacy Pool
npx hardhat run scripts/deploy-privacy-pool.cjs --network sepolia
```

---

## Usage Guide

### 1. Connect Wallet
- Click "Connect Wallet" to connect MetaMask
- Ensure you're on Sepolia testnet

### 2. Deposit to Privacy Pool
- Navigate to the Privacy Pool
- Deposit ETH (creates anonymous balance)
- Your deposits are tracked by encrypted identity, not wallet address

### 3. Create a Collection
- Click "Launch Collection"
- Set name, symbol, supply, and mint price
- Your creator identity is encrypted on-chain

### 4. Mint NFTs
- Browse collections
- Click "Mint" on any collection
- Payment comes from your Privacy Pool balance
- Your ownership is encrypted - nobody knows you own it

### 5. List for Sale
- Go to your Profile
- Click "List" on any NFT you own
- Set your price
- Your seller identity is encrypted

### 6. Buy NFTs
- Browse the marketplace
- Click "Buy" on any listed NFT
- Purchase uses Privacy Pool funds
- Your buyer identity is encrypted

### 7. Make Offers
- View any NFT details
- Submit an offer with your amount
- Owner can accept/reject offers
- All identities remain encrypted

---

## Testing

See [TESTING.md](./TESTING.md) for comprehensive testing instructions.

### Quick Test

```bash
# Compile contracts
npx hardhat compile

# Run unit tests (if available)
npx hardhat test

# Manual testing on Sepolia
# 1. Deploy contracts
npx hardhat run scripts/deploy-all.cjs --network sepolia

# 2. Start the app
npm run dev

# 3. Test the flow:
#    - Connect wallet
#    - Deposit to Privacy Pool
#    - Create a collection
#    - Mint an NFT
#    - List it for sale
#    - Buy with different account
```

---

## Privacy Features Deep Dive

### 1. Encrypted Ownership (euint64/euint256)

Traditional ERC-721:
```solidity
mapping(uint256 => address) private _owners;  // PUBLIC!
```

VeilX:
```solidity
mapping(uint256 => euint64) private encryptedOwners;  // ENCRYPTED!
```

### 2. Privacy-Preserving Events

Traditional events expose everything:
```solidity
event Transfer(address indexed from, address indexed to, uint256 tokenId);
```

VeilX events hide identities:
```solidity
event NFTSold(uint256 indexed tokenId, uint256 price, uint256 timestamp);
// NO addresses emitted!
```

### 3. Relayer Architecture

- Users sign messages with their wallet
- Backend verifies signatures
- Relayer wallet submits actual transactions
- On-chain, only relayer address is visible

### 4. Privacy Pool Mechanics

```
User A deposits 0.1 ETH  ──┐
User B deposits 0.5 ETH  ──┼──▶ Privacy Pool ──▶ User C buys NFT
User C deposits 0.2 ETH  ──┘                     (from pooled funds)
                                                  
Result: No on-chain link between User C's 
        deposit wallet and the NFT ownership
```

### 5. Access Control

Only authorized parties can decrypt:
```solidity
FHE.allowThis(encryptedOwner);           // Contract can use it
FHE.allow(encryptedOwner, msg.sender);   // Relayer can access
// Original user identity remains secret from everyone else
```

---

## Ownership Model & Production Roadmap

### How Ownership Works

| Aspect | Traditional NFT | VeilX |
|--------|-----------------|-------|
| On-chain owner | Your wallet address | Encrypted (euint64) |
| `ownerOf()` returns | Your address | Relayer address |
| Prove ownership | Wallet holds token | Signature verification |
| Transfer directly | Yes, anytime | Through relayer |

**The Privacy Trade-off:**

Users have **cryptographically-proven ownership** - their wallet is the only one that can authorize actions on their NFT. However, they rely on the relayer to execute transactions. This is a conscious design choice: true anonymity requires the relayer pattern, otherwise wallet addresses would be exposed on-chain.

### Production Feature 1: Decentralized Relayer Network

**Current Design (Single Relayer):**
```
User → Signs message → Backend → Single Relayer Wallet → Blockchain
                                        ↑
                                   Single point of failure
```

**Production Solution:**
```
User → Signs message → Backend → Relayer Selection Contract → Multiple Relayers
                                        ↓
                              ┌─────────┼─────────┐
                              ↓         ↓         ↓
                          Relayer A  Relayer B  Relayer C
                          (Staked)   (Staked)   (Staked)
```

**How it works:**

| Component | Description |
|-----------|-------------|
| **Multiple relayers** | 5-10+ independent relayers, each with their own wallet |
| **Staking** | Relayers deposit ETH as collateral (slashed if misbehaving) |
| **Random selection** | Smart contract randomly picks which relayer handles each tx |
| **Redundancy** | If one relayer fails, another takes over |
| **Incentives** | Relayers earn small fees for processing transactions |

**Benefits:**
- No single point of failure
- Censorship resistant
- More trustworthy for high-value NFTs

### Production Feature 2: Emergency Reveal Function

**Problem:** If the platform shuts down, users can't prove they own their NFTs.

**Solution:** Add an emergency function to the smart contract:

```solidity
function emergencyReveal(uint256 tokenId, bytes memory proof) public {
    // User provides cryptographic proof linking wallet to encrypted owner
    // Decrypts and transfers NFT to proven owner
    // Only works after platform inactive for X days
}
```

**How it works:**

| Step | What Happens |
|------|--------------|
| 1. **Trigger** | Platform inactive for 30+ days |
| 2. **Request** | User calls `emergencyReveal()` with proof |
| 3. **Verify** | Contract verifies wallet matches encrypted owner |
| 4. **Transfer** | NFT transferred to user's actual wallet |
| 5. **Trade-off** | User's address becomes public (but they keep NFT) |

**Proof mechanisms could include:**
- Signature from original mint/buy (stored encrypted)
- Zero-knowledge proof linking wallet to encrypted owner
- Time-locked decryption key held by DAO

### Production Roadmap Summary

| Feature | Current Status | Production Addition | Benefit |
|---------|---------------|---------------------|---------|
| Privacy | Encrypted ownership | Same | Core feature |
| Relayer | Single relayer | Decentralized network | No single point of failure |
| Recovery | Platform-dependent | Emergency reveal | Users never lose NFTs |
| Governance | Centralized | DAO control | Community trust |

---

## Business Potential

### Target Markets

1. **High-Value Collectors**: Privacy from whale tracking
2. **Celebrities**: Private NFT collections without public exposure
3. **Corporate NFTs**: Private ownership for business assets
4. **Gaming NFTs**: Fair trading without bot manipulation

### Revenue Model

1. **Transaction Fees**: Small percentage on trades
2. **Collection Deployment Fees**: Fee for launching collections
3. **Premium Features**: Enhanced privacy options
4. **B2B Licensing**: White-label solution for enterprises

### Competitive Advantages

| Feature | OpenSea | Blur | VeilX |
|---------|---------|------|-------|
| Encrypted Ownership | No | No | **Yes** |
| Anonymous Buying | No | No | **Yes** |
| Anti Front-Running | No | Partial | **Yes** |
| Privacy Pool | No | No | **Yes** |

### Growth Potential

- NFT market projected to reach $211B by 2030
- Privacy concerns increasing globally
- Regulatory pressure for financial privacy
- First-mover advantage in privacy-first NFT space

---

## Project Structure

```
veilx/
├── contracts/           # Solidity smart contracts
│   ├── VeilXCollection.sol
│   ├── CollectionFactory.sol
│   ├── PrivacyPool.sol
│   ├── ConfidentialNFT.sol
│   ├── ConfidentialMarketplace.sol
│   └── README.md
├── scripts/             # Deployment scripts
│   ├── deploy-all.cjs
│   ├── deploy-factory.cjs
│   └── deploy-privacy-pool.cjs
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── hooks/       # React hooks (FHE, contracts)
│   │   ├── lib/         # Utilities (wallet, signing)
│   │   └── pages/       # Page components
│   └── index.html
├── server/              # Express backend
│   ├── routes.ts        # API endpoints
│   ├── relayer.ts       # Relayer service
│   ├── fhevm-server.ts  # Server-side FHE
│   └── storage.ts       # Data storage
├── shared/              # Shared types
│   ├── schema.ts        # Database schema
│   └── fhevm-config.ts  # FHE configuration
├── deployments/         # Deployment artifacts
│   └── sepolia.json     # Deployed addresses
└── hardhat.config.cjs   # Hardhat configuration
```

---

## License

MIT License - see [LICENSE](./LICENSE) file.

---

## Acknowledgments

- [Zama](https://www.zama.ai/) for the fhEVM technology
- [Hardhat](https://hardhat.org/) for Ethereum development
- [shadcn/ui](https://ui.shadcn.com/) for UI components

---

## Contact

For questions or collaboration:
- GitHub Issues: [Open an issue](https://github.com/your-repo/veilx/issues)

---

**Built with privacy in mind, powered by Zama fhEVM.**
