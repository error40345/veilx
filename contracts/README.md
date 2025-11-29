# VeilX Smart Contracts

This directory contains the Solidity smart contracts that power VeilX, a privacy-preserving NFT marketplace built on Zama's fhEVM (Fully Homomorphic Encryption on EVM).

## Overview

VeilX uses FHE to encrypt sensitive identity data on-chain while maintaining public market transparency for prices and volumes.

| Contract | Purpose | FHE Usage |
|----------|---------|-----------|
| VeilXCollection.sol | NFT collection with private ownership | `euint64` for owner/seller |
| CollectionFactory.sol | Deploy new collections | `euint64` for creator |
| PrivacyPool.sol | Anonymous deposits | `euint64` for balances |
| ConfidentialNFT.sol | Standalone private NFT | `euint256` for owner |
| ConfidentialMarketplace.sol | Trade with private parties | `euint256` for buyer/seller |

---

## Contracts

### VeilXCollection.sol

The main NFT contract used in VeilX. Each collection is a separate instance of this contract.

**Privacy Features:**
- `mapping(uint256 => euint64) private encryptedOwners` - Owner addresses encrypted
- `mapping(uint256 => euint64) private encryptedSellers` - Seller addresses encrypted
- Events emit NO addresses, only token IDs and prices

**Key Functions:**
```solidity
function mint(
    string memory tokenUri,
    externalEuint64 encryptedOwnerInput,
    bytes calldata inputProof
) external payable returns (uint256);

function listNFT(
    uint256 tokenId,
    uint256 price,
    externalEuint64 encryptedSellerInput,
    bytes calldata inputProof
) external;

function buyNFT(
    uint256 tokenId,
    externalEuint64 encryptedBuyerInput,
    bytes calldata inputProof
) external payable;
```

### CollectionFactory.sol

Factory contract for deploying new VeilXCollection instances.

**Privacy Features:**
- `euint64 encryptedCreator` - Collection creator identity encrypted
- Inherits from `ZamaEthereumConfig` for FHE operations

**Key Functions:**
```solidity
function createCollection(
    string memory name,
    string memory symbol,
    string memory baseUri,
    uint256 totalSupply,
    uint256 mintPrice,
    externalEuint64 encryptedCreatorInput,
    bytes calldata inputProof
) external returns (address);
```

### PrivacyPool.sol

Enables anonymous NFT purchases by breaking the correlation between deposit wallet and NFT ownership.

**Privacy Features:**
- `mapping(bytes32 => euint64) private _encryptedBalances` - Balances by encrypted ID
- Users deposit ETH, purchases deduct from pool
- No on-chain link between depositor and buyer

**Key Functions:**
```solidity
function deposit(bytes32 accountHash) external payable;
function deduct(bytes32 accountHash, uint256 amount) external;
function creditSeller(bytes32 sellerHash, uint256 amount) external;
```

### ConfidentialNFT.sol

Standalone NFT contract with maximum privacy using 256-bit encryption.

**Privacy Features:**
- `mapping(uint256 => euint256) private _encryptedOwners` - 256-bit encrypted ownership
- Public `ownerOf()` returns relayer address (ERC-721 compatibility)
- True ownership only via `getEncryptedOwner()`

### ConfidentialMarketplace.sol

Marketplace for trading NFTs with fully encrypted participant identities.

**Privacy Features:**
- `euint256 encryptedSeller` - Listing seller encrypted
- `euint256 encryptedBuyer` - Trade buyer encrypted
- Public pricing for market transparency

---

## FHE Implementation Details

### Zama fhEVM 0.9.x Compatibility

All contracts inherit from `ZamaEthereumConfig`:

```solidity
import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

contract VeilXCollection is ZamaEthereumConfig {
    // Contract code
}
```

### Encrypted Types Used

| Type | Bits | Usage |
|------|------|-------|
| `euint64` | 64 | Owner addresses (truncated) |
| `euint256` | 256 | Full address encryption |
| `externalEuint64` | 64 | External encrypted input |

### FHE Operations

**Encryption (from external input):**
```solidity
euint64 encryptedOwner = FHE.fromExternal(encryptedOwnerInput, inputProof);
```

**Access Control:**
```solidity
FHE.allowThis(encryptedOwner);           // Contract can use
FHE.allow(encryptedOwner, msg.sender);   // Caller can access
```

### Privacy-Preserving Events

Traditional events expose addresses:
```solidity
// BAD - Leaks addresses
event Transfer(address indexed from, address indexed to, uint256 tokenId);
```

VeilX events hide identities:
```solidity
// GOOD - No addresses
event NFTMinted(uint256 indexed tokenId, uint256 mintPrice, uint256 timestamp);
event NFTSold(uint256 indexed tokenId, uint256 price, uint256 timestamp);
```

---

## Deployment

### Prerequisites

1. Sepolia ETH from a [faucet](https://sepoliafaucet.com)
2. Private key for deployment

### Environment Setup

```bash
export DEPLOYER_PRIVATE_KEY="your_private_key_here"
```

### Compile Contracts

```bash
npx hardhat compile
```

### Deploy All Contracts

```bash
npx hardhat run scripts/deploy-all.cjs --network sepolia
```

### Deploy Individual Contracts

```bash
# Deploy Collection Factory
npx hardhat run scripts/deploy-factory.cjs --network sepolia

# Deploy Privacy Pool
npx hardhat run scripts/deploy-privacy-pool.cjs --network sepolia
```

### Deployed Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| CollectionFactory | `0x15bc27140f84fFcDc994C4c2878a7d8A27FE76D3` |
| PrivacyPool | `0xD6295bd696734DbA6455E3Be2e10616C27F72f7F` |
| ConfidentialNFT | `0x91C94eA6c08c762C5475d2037bf45F3B8c9C80D9` |
| ConfidentialMarketplace | `0xE8660238894c8a594844A8bB4efD760c6760D7be` |

---

## Security Considerations

1. **Access Control**: `FHE.allow()` restricts who can decrypt values
2. **Relayer Pattern**: Only relayer submits transactions (hides user wallets)
3. **Event Privacy**: No addresses emitted in events
4. **Pool Privacy**: Deposits and purchases are decoupled

---

## Gas Costs

FHE operations are more expensive than regular operations:

| Operation | Estimated Gas |
|-----------|---------------|
| Mint (with FHE) | ~200,000 - 300,000 |
| List (with FHE) | ~150,000 - 200,000 |
| Buy (with FHE) | ~250,000 - 350,000 |
| Transfer (with FHE) | ~200,000 - 250,000 |

---

## Learn More

- [Zama fhEVM Documentation](https://docs.zama.ai/fhevm)
- [fhevmjs SDK](https://github.com/zama-ai/fhevmjs)
- [fhEVM Solidity Library](https://github.com/zama-ai/fhevm-solidity)

---

## License

MIT License - see [LICENSE](../LICENSE)
