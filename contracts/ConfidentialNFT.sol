// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title ConfidentialNFT
 * @author VeilX Team
 * @notice PRIVACY-PRESERVING NFT with encrypted ownership using Zama's FHEVM
 * @dev Deployed on Ethereum Sepolia with Zama fhEVM Coprocessor
 * 
 * KEY PRIVACY FEATURES:
 * - Owner addresses are stored encrypted (euint256)
 * - Public ownerOf returns relayer address (actual ownership is encrypted)
 * - All user mints go through relayer for privacy
 * - Events do NOT emit user addresses (only relayer/marketplace)
 * 
 * ARCHITECTURE:
 * - Encrypted ownership: euint256 stores real owner's encrypted address
 * - Public ownership: Returns relayer for on-chain compatibility
 * - Relayer-based: User transactions via relayer hide real identities
 * - Public data: token URI, mint price, total supply
 * - Private data: who actually owns which NFT (only encrypted on-chain)
 */
contract ConfidentialNFT is ZamaEthereumConfig {
    string public name = "VeilX Confidential NFT";
    string public symbol = "VXNFT";
    
    uint256 private _tokenIdCounter;
    address public owner;
    address public marketplace;
    address public relayer;
    
    mapping(uint256 => euint256) private _encryptedOwners;
    mapping(uint256 => address) private _publicOwners;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => uint256) public mintPrices;
    mapping(uint256 => address) private _approvals;
    
    event Transfer(uint256 indexed tokenId);
    event Minted(uint256 indexed tokenId, string uri, uint256 mintPrice);
    event Approval(uint256 indexed tokenId, address indexed approved);
    event MarketplaceSet(address indexed marketplace);
    event RelayerSet(address indexed relayer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }
    
    modifier onlyRelayerOrOwner() {
        require(msg.sender == relayer || msg.sender == owner, "Not authorized");
        _;
    }
    
    modifier onlyAuthorized(uint256 tokenId) {
        require(
            msg.sender == _publicOwners[tokenId] || 
            msg.sender == _approvals[tokenId] ||
            msg.sender == marketplace ||
            msg.sender == relayer ||
            msg.sender == owner,
            "Not authorized to transfer"
        );
        _;
    }
    
    constructor() {
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
        emit RelayerSet(_relayer);
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
     * @notice Set the marketplace contract address
     * @param _marketplace Address of the ConfidentialMarketplace contract
     */
    function setMarketplace(address _marketplace) external onlyOwner {
        require(_marketplace != address(0), "Invalid marketplace address");
        marketplace = _marketplace;
        emit MarketplaceSet(_marketplace);
    }
    
    /**
     * @notice Mint a new NFT with encrypted ownership
     * @dev When minted via relayer, public owner is relayer (for privacy)
     * @param uri Metadata URI for the NFT (IPFS/Arweave link)
     * @param mintPrice Public mint price in wei
     * @param encryptedOwner Encrypted owner address from client
     * @param inputProof Zero-knowledge proof for the encrypted input
     * @return tokenId The ID of the newly minted NFT
     */
    function mint(
        string memory uri,
        uint256 mintPrice,
        externalEuint256 encryptedOwner,
        bytes calldata inputProof
    ) public returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        
        euint256 ownerCiphertext = FHE.fromExternal(encryptedOwner, inputProof);
        
        _encryptedOwners[tokenId] = ownerCiphertext;
        _publicOwners[tokenId] = msg.sender;
        _tokenURIs[tokenId] = uri;
        mintPrices[tokenId] = mintPrice;
        
        FHE.allowThis(ownerCiphertext);
        FHE.allow(ownerCiphertext, msg.sender);
        
        emit Minted(tokenId, uri, mintPrice);
        emit Transfer(tokenId);
        
        return tokenId;
    }
    
    /**
     * @notice Approve an address to transfer the NFT
     * @param tokenId The token ID to approve
     * @param approved Address to approve (usually marketplace)
     */
    function approve(uint256 tokenId, address approved) public onlyAuthorized(tokenId) {
        _approvals[tokenId] = approved;
        emit Approval(tokenId, approved);
    }
    
    /**
     * @notice Get the approved address for a token
     * @param tokenId The token ID
     * @return The approved address
     */
    function getApproved(uint256 tokenId) public view returns (address) {
        require(_exists(tokenId), "Token does not exist");
        return _approvals[tokenId];
    }
    
    /**
     * @notice Transfer NFT (updates both public and encrypted ownership)
     * @param tokenId The token ID to transfer
     * @param to New public owner address (relayer for privacy)
     * @param encryptedNewOwner Encrypted new owner address
     * @param inputProof Zero-knowledge proof for the encrypted input
     */
    function confidentialTransfer(
        uint256 tokenId,
        address to,
        externalEuint256 encryptedNewOwner,
        bytes calldata inputProof
    ) public onlyAuthorized(tokenId) {
        require(_exists(tokenId), "Token does not exist");
        require(to != address(0), "Invalid recipient");
        
        euint256 newOwnerCiphertext = FHE.fromExternal(encryptedNewOwner, inputProof);
        
        _encryptedOwners[tokenId] = newOwnerCiphertext;
        _publicOwners[tokenId] = to;
        delete _approvals[tokenId];
        
        FHE.allowThis(newOwnerCiphertext);
        FHE.allow(newOwnerCiphertext, to);
        
        emit Transfer(tokenId);
    }
    
    /**
     * @notice Standard transfer (for marketplace compatibility)
     * @dev Updates public owner, encrypted owner should be updated separately
     */
    function transfer(uint256 tokenId, address to) public onlyAuthorized(tokenId) {
        require(_exists(tokenId), "Token does not exist");
        require(to != address(0), "Invalid recipient");
        
        _publicOwners[tokenId] = to;
        delete _approvals[tokenId];
        
        euint256 newEncryptedOwner = FHE.asEuint256(uint256(uint160(to)));
        _encryptedOwners[tokenId] = newEncryptedOwner;
        
        FHE.allowThis(newEncryptedOwner);
        FHE.allow(newEncryptedOwner, to);
        
        emit Transfer(tokenId);
    }
    
    /**
     * @notice Transfer from owner to recipient (marketplace integration)
     * @param from Current owner address
     * @param to New owner address  
     * @param tokenId The token ID to transfer
     */
    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_exists(tokenId), "Token does not exist");
        require(_publicOwners[tokenId] == from, "From address is not owner");
        require(to != address(0), "Invalid recipient");
        require(
            msg.sender == from || 
            msg.sender == _approvals[tokenId] ||
            msg.sender == marketplace ||
            msg.sender == relayer ||
            msg.sender == owner,
            "Not authorized to transfer"
        );
        
        _publicOwners[tokenId] = to;
        
        euint256 newEncryptedOwner = FHE.asEuint256(uint256(uint160(to)));
        _encryptedOwners[tokenId] = newEncryptedOwner;
        
        delete _approvals[tokenId];
        
        FHE.allowThis(newEncryptedOwner);
        FHE.allow(newEncryptedOwner, to);
        
        emit Transfer(tokenId);
    }
    
    /**
     * @notice Check if caller owns the NFT (returns encrypted boolean)
     * @param tokenId The token ID to check
     * @return Encrypted boolean indicating ownership
     */
    function ownsToken(uint256 tokenId) public returns (ebool) {
        require(_exists(tokenId), "Token does not exist");
        
        euint256 callerAddress = FHE.asEuint256(uint256(uint160(msg.sender)));
        ebool isOwner = FHE.eq(_encryptedOwners[tokenId], callerAddress);
        
        return isOwner;
    }
    
    /**
     * @notice Get the token URI (public metadata)
     * @param tokenId The token ID
     */
    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return _tokenURIs[tokenId];
    }
    
    /**
     * @notice Get the public owner (relayer for privacy, or actual for direct mints)
     * @param tokenId The token ID
     */
    function ownerOf(uint256 tokenId) public view returns (address) {
        require(_exists(tokenId), "Token does not exist");
        return _publicOwners[tokenId];
    }
    
    /**
     * @notice Get encrypted owner handle (for authorized decryption only)
     * @param tokenId The token ID
     * @return The encrypted owner handle
     */
    function getEncryptedOwner(uint256 tokenId) public view returns (euint256) {
        require(_exists(tokenId), "Token does not exist");
        return _encryptedOwners[tokenId];
    }
    
    /**
     * @notice Get total supply of NFTs
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @notice Check if a token exists
     * @param tokenId The token ID to check
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return bytes(_tokenURIs[tokenId]).length > 0;
    }
}
