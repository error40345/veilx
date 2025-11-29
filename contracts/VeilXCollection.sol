// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

contract VeilXCollection is ZamaEthereumConfig {
    string public name;
    string public symbol;
    string public baseUri;
    uint256 public totalSupply;
    uint256 public mintPrice;
    address public creator;
    address public factory;
    
    uint256 public currentTokenId;
    uint256 public mintedCount;
    
    mapping(uint256 => address) private owners;
    mapping(uint256 => euint64) private encryptedOwners;
    mapping(uint256 => string) private tokenURIs;
    mapping(uint256 => bool) public isListed;
    mapping(uint256 => uint256) public listingPrices;
    mapping(uint256 => address) private sellers;
    mapping(uint256 => euint64) private encryptedSellers;
    
    // Offers system
    struct Offer {
        address offerer;
        uint256 amount;
        euint64 encryptedOfferer;
        bool isActive;
        uint256 createdAt;
    }
    
    uint256 public currentOfferId;
    mapping(uint256 => Offer) private offers;
    mapping(uint256 => uint256[]) private tokenOffers; // tokenId => offerIds
    mapping(address => uint256[]) private userOffers; // user => offerIds
    
    event NFTMinted(
        uint256 indexed tokenId,
        uint256 mintPrice,
        uint256 timestamp
    );
    
    event NFTListed(
        uint256 indexed tokenId,
        uint256 price,
        uint256 timestamp
    );
    
    event NFTUnlisted(
        uint256 indexed tokenId,
        uint256 timestamp
    );
    
    event NFTSold(
        uint256 indexed tokenId,
        uint256 price,
        uint256 timestamp
    );
    
    event NFTTransferred(
        uint256 indexed tokenId,
        uint256 timestamp
    );
    
    event OfferCreated(
        uint256 indexed offerId,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 timestamp
    );
    
    event OfferCanceled(
        uint256 indexed offerId,
        uint256 indexed tokenId,
        uint256 timestamp
    );
    
    event OfferAccepted(
        uint256 indexed offerId,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 timestamp
    );
    
    constructor(
        string memory _name,
        string memory _symbol,
        string memory _baseUri,
        uint256 _totalSupply,
        uint256 _mintPrice,
        address _creator
    ) {
        name = _name;
        symbol = _symbol;
        baseUri = _baseUri;
        totalSupply = _totalSupply;
        mintPrice = _mintPrice;
        creator = _creator;
        factory = msg.sender;
        currentTokenId = 0;
        mintedCount = 0;
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        return owners[tokenId];
    }
    
    function mint(
        string memory tokenUri,
        externalEuint64 encryptedOwnerInput,
        bytes calldata inputProof
    ) external payable returns (uint256) {
        require(mintedCount < totalSupply, "Max supply reached");
        require(msg.value >= mintPrice, "Insufficient payment");
        
        euint64 encryptedOwner = FHE.fromExternal(encryptedOwnerInput, inputProof);
        FHE.allowThis(encryptedOwner);
        FHE.allow(encryptedOwner, msg.sender);
        
        currentTokenId++;
        uint256 tokenId = currentTokenId;
        mintedCount++;
        
        owners[tokenId] = msg.sender;
        encryptedOwners[tokenId] = encryptedOwner;
        tokenURIs[tokenId] = tokenUri;
        
        if (msg.value > mintPrice) {
            payable(msg.sender).transfer(msg.value - mintPrice);
        }
        
        payable(creator).transfer(mintPrice);
        
        emit NFTMinted(tokenId, mintPrice, block.timestamp);
        
        return tokenId;
    }
    
    function listNFT(
        uint256 tokenId,
        uint256 price,
        externalEuint64 encryptedSellerInput,
        bytes calldata inputProof
    ) external {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        require(owners[tokenId] == msg.sender, "Not the owner");
        require(!isListed[tokenId], "Already listed");
        require(price > 0, "Price must be positive");
        
        euint64 encryptedSeller = FHE.fromExternal(encryptedSellerInput, inputProof);
        FHE.allowThis(encryptedSeller);
        FHE.allow(encryptedSeller, msg.sender);
        
        isListed[tokenId] = true;
        listingPrices[tokenId] = price;
        sellers[tokenId] = msg.sender;
        encryptedSellers[tokenId] = encryptedSeller;
        
        emit NFTListed(tokenId, price, block.timestamp);
    }
    
    function unlistNFT(uint256 tokenId) external {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        require(owners[tokenId] == msg.sender, "Not the owner");
        require(isListed[tokenId], "Not listed");
        
        isListed[tokenId] = false;
        listingPrices[tokenId] = 0;
        sellers[tokenId] = address(0);
        
        emit NFTUnlisted(tokenId, block.timestamp);
    }
    
    function buyNFT(
        uint256 tokenId,
        externalEuint64 encryptedBuyerInput,
        bytes calldata inputProof
    ) external payable {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        require(isListed[tokenId], "Not listed");
        require(msg.value >= listingPrices[tokenId], "Insufficient payment");
        // Removed msg.sender ownership check to support relayer/pool purchases
        // Off-chain validation ensures users can't buy their own NFTs via encrypted owner comparison
        
        uint256 salePrice = listingPrices[tokenId];
        address seller = sellers[tokenId];
        
        euint64 encryptedBuyer = FHE.fromExternal(encryptedBuyerInput, inputProof);
        FHE.allowThis(encryptedBuyer);
        FHE.allow(encryptedBuyer, msg.sender);
        
        owners[tokenId] = msg.sender;
        encryptedOwners[tokenId] = encryptedBuyer;
        isListed[tokenId] = false;
        listingPrices[tokenId] = 0;
        sellers[tokenId] = address(0);
        
        if (msg.value > salePrice) {
            payable(msg.sender).transfer(msg.value - salePrice);
        }
        
        payable(seller).transfer(salePrice);
        
        emit NFTSold(tokenId, salePrice, block.timestamp);
    }
    
    function transferNFT(
        uint256 tokenId,
        address to,
        externalEuint64 encryptedNewOwnerInput,
        bytes calldata inputProof
    ) external {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        require(owners[tokenId] == msg.sender, "Not the owner");
        require(!isListed[tokenId], "Cannot transfer listed NFT");
        require(to != address(0), "Invalid recipient");
        
        euint64 encryptedNewOwner = FHE.fromExternal(encryptedNewOwnerInput, inputProof);
        FHE.allowThis(encryptedNewOwner);
        FHE.allow(encryptedNewOwner, to);
        
        owners[tokenId] = to;
        encryptedOwners[tokenId] = encryptedNewOwner;
        
        emit NFTTransferred(tokenId, block.timestamp);
    }
    
    function getTokenUri(uint256 tokenId) external view returns (string memory) {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        return tokenURIs[tokenId];
    }
    
    function getListing(uint256 tokenId) external view returns (bool listed, uint256 price) {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        return (isListed[tokenId], listingPrices[tokenId]);
    }
    
    function getCollectionInfo() external view returns (
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        uint256 _mintedCount,
        uint256 _mintPrice,
        address _creator
    ) {
        return (name, symbol, totalSupply, mintedCount, mintPrice, creator);
    }
    
    function remainingSupply() external view returns (uint256) {
        return totalSupply - mintedCount;
    }
    
    function isSoldOut() external view returns (bool) {
        return mintedCount >= totalSupply;
    }
    
    function withdraw() external {
        require(msg.sender == creator, "Only creator can withdraw");
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        payable(creator).transfer(balance);
    }
    
    // Make an offer for an NFT
    function makeOffer(
        uint256 tokenId,
        externalEuint64 encryptedOffererInput,
        bytes calldata inputProof
    ) external payable returns (uint256) {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        require(msg.value > 0, "Offer must be greater than 0");
        // Removed msg.sender ownership check to support relayer/pool purchases
        // Off-chain validation in the relayer ensures users can't offer on their own NFTs
        
        euint64 encryptedOfferer = FHE.fromExternal(encryptedOffererInput, inputProof);
        FHE.allowThis(encryptedOfferer);
        FHE.allow(encryptedOfferer, msg.sender);
        
        currentOfferId++;
        uint256 offerId = currentOfferId;
        
        offers[offerId] = Offer({
            offerer: msg.sender,
            amount: msg.value,
            encryptedOfferer: encryptedOfferer,
            isActive: true,
            createdAt: block.timestamp
        });
        
        tokenOffers[tokenId].push(offerId);
        userOffers[msg.sender].push(offerId);
        
        emit OfferCreated(offerId, tokenId, msg.value, block.timestamp);
        
        return offerId;
    }
    
    // Cancel an offer
    function cancelOffer(uint256 offerId) external {
        require(offerId > 0 && offerId <= currentOfferId, "Invalid offer ID");
        Offer storage offer = offers[offerId];
        require(offer.isActive, "Offer not active");
        require(offer.offerer == msg.sender, "Not the offerer");
        
        uint256 refundAmount = offer.amount;
        offer.isActive = false;
        offer.amount = 0;
        
        payable(msg.sender).transfer(refundAmount);
        
        // Find which token this offer was for (search through tokenOffers)
        uint256 tokenId = 0;
        for (uint256 i = 1; i <= currentTokenId; i++) {
            uint256[] storage offerIds = tokenOffers[i];
            for (uint256 j = 0; j < offerIds.length; j++) {
                if (offerIds[j] == offerId) {
                    tokenId = i;
                    break;
                }
            }
            if (tokenId > 0) break;
        }
        
        emit OfferCanceled(offerId, tokenId, block.timestamp);
    }
    
    // Accept an offer (owner accepts and transfers NFT)
    function acceptOffer(
        uint256 offerId,
        externalEuint64 encryptedNewOwnerInput,
        bytes calldata inputProof
    ) external {
        require(offerId > 0 && offerId <= currentOfferId, "Invalid offer ID");
        Offer storage offer = offers[offerId];
        require(offer.isActive, "Offer not active");
        
        // Find which token this offer was for
        uint256 tokenId = 0;
        for (uint256 i = 1; i <= currentTokenId; i++) {
            uint256[] storage offerIds = tokenOffers[i];
            for (uint256 j = 0; j < offerIds.length; j++) {
                if (offerIds[j] == offerId) {
                    tokenId = i;
                    break;
                }
            }
            if (tokenId > 0) break;
        }
        
        require(tokenId > 0, "Offer token not found");
        require(owners[tokenId] == msg.sender, "Not the owner");
        require(!isListed[tokenId], "Cannot accept offer on listed NFT");
        
        uint256 saleAmount = offer.amount;
        address newOwner = offer.offerer;
        
        // Transfer the encrypted owner data
        euint64 encryptedNewOwner = FHE.fromExternal(encryptedNewOwnerInput, inputProof);
        FHE.allowThis(encryptedNewOwner);
        FHE.allow(encryptedNewOwner, newOwner);
        
        // Transfer ownership
        owners[tokenId] = newOwner;
        encryptedOwners[tokenId] = encryptedNewOwner;
        
        // Mark offer as inactive
        offer.isActive = false;
        offer.amount = 0;
        
        // Cancel all other active offers for this token (refund them)
        uint256[] storage offerIds = tokenOffers[tokenId];
        for (uint256 i = 0; i < offerIds.length; i++) {
            uint256 oid = offerIds[i];
            if (oid != offerId && offers[oid].isActive) {
                uint256 refundAmount = offers[oid].amount;
                address offerer = offers[oid].offerer;
                offers[oid].isActive = false;
                offers[oid].amount = 0;
                payable(offerer).transfer(refundAmount);
            }
        }
        
        // Pay the seller
        payable(msg.sender).transfer(saleAmount);
        
        emit OfferAccepted(offerId, tokenId, saleAmount, block.timestamp);
    }
    
    // Get offer details
    function getOffer(uint256 offerId) external view returns (
        address offerer,
        uint256 amount,
        bool isActive,
        uint256 createdAt
    ) {
        require(offerId > 0 && offerId <= currentOfferId, "Invalid offer ID");
        Offer storage offer = offers[offerId];
        return (offer.offerer, offer.amount, offer.isActive, offer.createdAt);
    }
    
    // Get all offers for a token
    function getTokenOffers(uint256 tokenId) external view returns (uint256[] memory) {
        require(tokenId > 0 && tokenId <= currentTokenId, "Invalid token ID");
        return tokenOffers[tokenId];
    }
    
    // Get all offers made by a user
    function getUserOffers(address user) external view returns (uint256[] memory) {
        return userOffers[user];
    }
}
