// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";
import "./VeilXCollection.sol";

contract CollectionFactory is ZamaEthereumConfig {
    struct CollectionInfo {
        address contractAddress;
        string name;
        string symbol;
        uint256 totalSupply;
        uint256 mintPrice;
        euint64 encryptedCreator;
        uint256 createdAt;
        bool isActive;
    }
    
    CollectionInfo[] public collections;
    mapping(address => uint256[]) public creatorCollections;
    mapping(address => bool) public isVeilXCollection;
    
    uint256 public deploymentFee = 0.001 ether;
    address public owner;
    
    event CollectionDeployed(
        uint256 indexed collectionId,
        address indexed contractAddress,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 mintPrice
    );
    
    event CollectionDeactivated(uint256 indexed collectionId);
    event DeploymentFeeUpdated(uint256 newFee);
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    function deployCollection(
        string memory name,
        string memory symbol,
        string memory baseUri,
        uint256 totalSupply,
        uint256 mintPrice,
        externalEuint64 encryptedCreatorInput,
        bytes calldata inputProof
    ) external payable returns (uint256 collectionId, address collectionAddress) {
        require(msg.value >= deploymentFee, "Insufficient deployment fee");
        require(bytes(name).length > 0, "Name required");
        require(bytes(symbol).length > 0, "Symbol required");
        require(totalSupply > 0, "Supply must be positive");
        
        euint64 encryptedCreator = FHE.fromExternal(encryptedCreatorInput, inputProof);
        FHE.allowThis(encryptedCreator);
        
        VeilXCollection newCollection = new VeilXCollection(
            name,
            symbol,
            baseUri,
            totalSupply,
            mintPrice,
            msg.sender
        );
        
        collectionAddress = address(newCollection);
        collectionId = collections.length;
        
        collections.push(CollectionInfo({
            contractAddress: collectionAddress,
            name: name,
            symbol: symbol,
            totalSupply: totalSupply,
            mintPrice: mintPrice,
            encryptedCreator: encryptedCreator,
            createdAt: block.timestamp,
            isActive: true
        }));
        
        creatorCollections[msg.sender].push(collectionId);
        isVeilXCollection[collectionAddress] = true;
        
        emit CollectionDeployed(
            collectionId,
            collectionAddress,
            name,
            symbol,
            totalSupply,
            mintPrice
        );
        
        return (collectionId, collectionAddress);
    }
    
    function getCollection(uint256 collectionId) external view returns (
        address contractAddress,
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        uint256 mintPrice,
        uint256 createdAt,
        bool isActive
    ) {
        require(collectionId < collections.length, "Invalid collection ID");
        CollectionInfo storage info = collections[collectionId];
        return (
            info.contractAddress,
            info.name,
            info.symbol,
            info.totalSupply,
            info.mintPrice,
            info.createdAt,
            info.isActive
        );
    }
    
    function getCollectionCount() external view returns (uint256) {
        return collections.length;
    }
    
    function getActiveCollections() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < collections.length; i++) {
            if (collections[i].isActive) {
                activeCount++;
            }
        }
        
        uint256[] memory activeIds = new uint256[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < collections.length; i++) {
            if (collections[i].isActive) {
                activeIds[index] = i;
                index++;
            }
        }
        
        return activeIds;
    }
    
    function getCreatorCollections(address creator) external view returns (uint256[] memory) {
        return creatorCollections[creator];
    }
    
    function deactivateCollection(uint256 collectionId) external {
        require(collectionId < collections.length, "Invalid collection ID");
        CollectionInfo storage info = collections[collectionId];
        
        VeilXCollection collection = VeilXCollection(info.contractAddress);
        require(msg.sender == collection.creator() || msg.sender == owner, "Not authorized");
        
        info.isActive = false;
        emit CollectionDeactivated(collectionId);
    }
    
    function setDeploymentFee(uint256 newFee) external onlyOwner {
        deploymentFee = newFee;
        emit DeploymentFeeUpdated(newFee);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(owner).transfer(balance);
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
