// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title IConfidentialNFT
 * @notice Interface for the ConfidentialNFT contract
 */
interface IConfidentialNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function totalSupply() external view returns (uint256);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function mintPrices(uint256 tokenId) external view returns (uint256);
}

/**
 * @title ConfidentialMarketplace
 * @author VeilX Team
 * @notice FULLY PRIVATE NFT marketplace using Zama's FHEVM
 * @dev Deployed on Ethereum Sepolia with Zama fhEVM Coprocessor
 * 
 * KEY PRIVACY FEATURES:
 * - Buyer and seller addresses are ONLY stored encrypted (euint256)
 * - NO plaintext addresses emitted in events
 * - All user transactions go through relayer for privacy
 * - On-chain shows relayer as msg.sender, actual identities encrypted
 * 
 * MARKET PHILOSOPHY:
 * - Public: listing prices, floor price, volume, trade count, NFT IDs
 * - Private: who is buying, who is selling, who owns what
 * - Result: Fair market without whale tracking or front-running
 * 
 * WORKFLOW:
 * 1. Seller signs listing request off-chain
 * 2. Relayer verifies signature and creates listing with encrypted identity
 * 3. Buyer signs purchase request off-chain
 * 4. Relayer verifies and executes purchase with encrypted identity
 * 5. NFT transfers, ETH flows through pool, identities stay FULLY private
 */
contract ConfidentialMarketplace is ZamaEthereumConfig {
    IConfidentialNFT public nftContract;
    address public owner;
    address public relayer;
    
    struct Listing {
        uint256 nftId;
        euint256 encryptedSeller;
        uint256 price;
        bool isActive;
        uint256 createdAt;
    }
    
    struct Trade {
        uint256 nftId;
        euint256 encryptedBuyer;
        euint256 encryptedSeller;
        uint256 price;
        uint256 timestamp;
    }
    
    uint256 private _listingIdCounter;
    uint256 private _tradeIdCounter;
    uint256 public totalVolume;
    uint256 public floorPrice;
    
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public activeListingByNft;
    mapping(uint256 => Trade) public trades;
    
    event Listed(uint256 indexed listingId, uint256 indexed nftId, uint256 price);
    event Sold(uint256 indexed listingId, uint256 indexed nftId, uint256 price);
    event ListingCancelled(uint256 indexed listingId, uint256 indexed nftId);
    event FloorPriceUpdated(uint256 newFloorPrice);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event NFTContractUpdated(address indexed newNftContract);
    event RelayerUpdated(address indexed newRelayer);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }
    
    modifier onlyRelayerOrOwner() {
        require(msg.sender == relayer || msg.sender == owner, "Not authorized");
        _;
    }
    
    /**
     * @notice Initialize the marketplace with the NFT contract address
     * @param _nftContract Address of the ConfidentialNFT contract
     */
    constructor(address _nftContract) {
        require(_nftContract != address(0), "Invalid NFT contract");
        nftContract = IConfidentialNFT(_nftContract);
        owner = msg.sender;
        relayer = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }
    
    /**
     * @notice Set the relayer address (only owner)
     * @param _relayer Address of the relayer wallet
     */
    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer address");
        relayer = _relayer;
        emit RelayerUpdated(_relayer);
    }
    
    /**
     * @notice Transfer contract ownership
     * @param newOwner Address of new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    
    /**
     * @notice Update NFT contract address (owner only)
     * @param _nftContract New NFT contract address
     */
    function setNFTContract(address _nftContract) external onlyOwner {
        require(_nftContract != address(0), "Invalid NFT contract");
        nftContract = IConfidentialNFT(_nftContract);
        emit NFTContractUpdated(_nftContract);
    }
    
    /**
     * @notice Create a listing for an NFT (relayer submits on behalf of seller)
     * @dev Authorization verified off-chain via signature before relayer submits
     * @param nftId The NFT token ID to list
     * @param price Listing price in wei (public)
     * @param encryptedSeller Encrypted seller address
     * @param inputProof Zero-knowledge proof for encrypted input
     * @return listingId The ID of the new listing
     */
    function createListing(
        uint256 nftId,
        uint256 price,
        externalEuint256 encryptedSeller,
        bytes calldata inputProof
    ) public onlyRelayerOrOwner returns (uint256) {
        require(price > 0, "Price must be greater than 0");
        require(activeListingByNft[nftId] == 0, "NFT already listed");
        
        require(
            nftContract.getApproved(nftId) == address(this),
            "Marketplace not approved"
        );
        
        uint256 listingId = ++_listingIdCounter;
        
        euint256 seller = FHE.fromExternal(encryptedSeller, inputProof);
        
        listings[listingId] = Listing({
            nftId: nftId,
            encryptedSeller: seller,
            price: price,
            isActive: true,
            createdAt: block.timestamp
        });
        
        activeListingByNft[nftId] = listingId;
        
        if (floorPrice == 0 || price < floorPrice) {
            floorPrice = price;
            emit FloorPriceUpdated(price);
        }
        
        FHE.allowThis(seller);
        
        emit Listed(listingId, nftId, price);
        
        return listingId;
    }
    
    /**
     * @notice Buy a listed NFT (relayer submits on behalf of buyer)
     * @dev Payment handled via privacy pool, authorization verified off-chain
     * @param listingId The listing ID to purchase
     * @param encryptedBuyer Encrypted buyer address
     * @param inputProof Zero-knowledge proof for encrypted input
     * @return tradeId The ID of the completed trade
     */
    function buy(
        uint256 listingId,
        externalEuint256 encryptedBuyer,
        bytes calldata inputProof
    ) public payable onlyRelayerOrOwner returns (uint256) {
        Listing storage listing = listings[listingId];
        require(listing.isActive, "Listing is not active");
        
        euint256 buyer = FHE.fromExternal(encryptedBuyer, inputProof);
        
        uint256 tradeId = ++_tradeIdCounter;
        trades[tradeId] = Trade({
            nftId: listing.nftId,
            encryptedBuyer: buyer,
            encryptedSeller: listing.encryptedSeller,
            price: listing.price,
            timestamp: block.timestamp
        });
        
        listing.isActive = false;
        delete activeListingByNft[listing.nftId];
        totalVolume += listing.price;
        
        _updateFloorPrice();
        
        FHE.allowThis(buyer);
        FHE.allowThis(listing.encryptedSeller);
        
        emit Sold(listingId, listing.nftId, listing.price);
        
        return tradeId;
    }
    
    /**
     * @notice Cancel a listing (relayer submits on behalf of seller)
     * @param listingId The listing ID to cancel
     */
    function cancelListing(uint256 listingId) public onlyRelayerOrOwner {
        Listing storage listing = listings[listingId];
        require(listing.isActive, "Listing is not active");
        
        listing.isActive = false;
        delete activeListingByNft[listing.nftId];
        
        _updateFloorPrice();
        
        emit ListingCancelled(listingId, listing.nftId);
    }
    
    /**
     * @notice Get listing details (public data only - NO addresses)
     * @param listingId The listing ID
     * @return nftId The NFT token ID
     * @return price The listing price
     * @return isActive Whether the listing is active
     * @return createdAt When the listing was created
     */
    function getListing(uint256 listingId) public view returns (
        uint256 nftId,
        uint256 price,
        bool isActive,
        uint256 createdAt
    ) {
        Listing storage listing = listings[listingId];
        return (listing.nftId, listing.price, listing.isActive, listing.createdAt);
    }
    
    /**
     * @notice Get encrypted seller handle (for authorized decryption only)
     * @param listingId The listing ID
     * @return The encrypted seller handle
     */
    function getEncryptedSeller(uint256 listingId) public view returns (euint256) {
        require(listingId <= _listingIdCounter && listingId > 0, "Invalid listing ID");
        return listings[listingId].encryptedSeller;
    }
    
    /**
     * @notice Get encrypted buyer from a trade (for authorized decryption only)
     * @param tradeId The trade ID
     * @return The encrypted buyer handle
     */
    function getEncryptedBuyer(uint256 tradeId) public view returns (euint256) {
        require(tradeId <= _tradeIdCounter && tradeId > 0, "Invalid trade ID");
        return trades[tradeId].encryptedBuyer;
    }
    
    /**
     * @notice Get trade details (public data only - NO addresses)
     * @param tradeId The trade ID
     * @return nftId The NFT token ID
     * @return price The sale price
     * @return timestamp When the trade occurred
     */
    function getTrade(uint256 tradeId) public view returns (
        uint256 nftId,
        uint256 price,
        uint256 timestamp
    ) {
        Trade storage trade = trades[tradeId];
        return (trade.nftId, trade.price, trade.timestamp);
    }
    
    /**
     * @notice Get all active listings (public data only)
     * @return listingIds Array of active listing IDs
     * @return prices Array of listing prices
     * @return nftIds Array of NFT IDs
     */
    function getActiveListings() public view returns (
        uint256[] memory listingIds,
        uint256[] memory prices,
        uint256[] memory nftIds
    ) {
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= _listingIdCounter; i++) {
            if (listings[i].isActive) {
                activeCount++;
            }
        }
        
        listingIds = new uint256[](activeCount);
        prices = new uint256[](activeCount);
        nftIds = new uint256[](activeCount);
        
        uint256 index = 0;
        for (uint256 i = 1; i <= _listingIdCounter; i++) {
            if (listings[i].isActive) {
                listingIds[index] = i;
                prices[index] = listings[i].price;
                nftIds[index] = listings[i].nftId;
                index++;
            }
        }
        
        return (listingIds, prices, nftIds);
    }
    
    /**
     * @notice Get total number of listings (including inactive)
     */
    function getTotalListings() public view returns (uint256) {
        return _listingIdCounter;
    }
    
    /**
     * @notice Get total number of completed trades
     */
    function getTotalTrades() public view returns (uint256) {
        return _tradeIdCounter;
    }
    
    /**
     * @notice Get marketplace statistics
     * @return _totalVolume Total ETH traded
     * @return _floorPrice Current floor price
     * @return _totalListings Total listings created
     * @return _totalTrades Total trades completed
     */
    function getStats() public view returns (
        uint256 _totalVolume,
        uint256 _floorPrice,
        uint256 _totalListings,
        uint256 _totalTrades
    ) {
        return (totalVolume, floorPrice, _listingIdCounter, _tradeIdCounter);
    }
    
    /**
     * @dev Update floor price based on active listings
     */
    function _updateFloorPrice() internal {
        uint256 newFloor = 0;
        for (uint256 i = 1; i <= _listingIdCounter; i++) {
            if (listings[i].isActive) {
                if (newFloor == 0 || listings[i].price < newFloor) {
                    newFloor = listings[i].price;
                }
            }
        }
        if (newFloor != floorPrice) {
            floorPrice = newFloor;
            emit FloorPriceUpdated(newFloor);
        }
    }
}
