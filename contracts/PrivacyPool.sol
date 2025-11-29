// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivacyPool
 * @author VeilX Team
 * @notice Privacy-preserving deposit pool that breaks the link between depositor and minting activity
 * @dev Users deposit ETH to the pool, then mint NFTs using pool funds via the relayer
 * 
 * PRIVACY FEATURES:
 * - User balances are tracked by encrypted identity (not wallet address)
 * - Deposits and minting are decoupled - can deposit anytime, mint later
 * - Multiple deposits mix together, breaking timing correlation
 * - Relayer pays for minting from pooled funds
 * 
 * HOW IT WORKS:
 * 1. User deposits ETH to the pool with their encrypted identity
 * 2. Backend tracks their balance off-chain (by encrypted ID)
 * 3. When minting, relayer deducts from their pool balance and pays the contract
 * 4. No on-chain link between the depositor and the NFT minted
 */
contract PrivacyPool is ZamaEthereumConfig {
    address public owner;
    address public relayer;
    
    uint256 public totalPoolBalance;
    uint256 public totalDeposits;
    uint256 public totalWithdrawals;
    
    mapping(bytes32 => uint256) private _balances;
    
    mapping(bytes32 => euint64) private _encryptedBalances;
    
    uint256 public constant MIN_DEPOSIT = 0.001 ether;
    uint256 public constant MAX_DEPOSIT = 10 ether;
    
    event Deposited(bytes32 indexed depositId, uint256 amount, uint256 timestamp);
    event Withdrawn(bytes32 indexed withdrawalId, uint256 amount, uint256 timestamp);
    event RelayerPayment(uint256 amount, uint256 timestamp);
    event RelayerSet(address indexed relayer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BalanceUpdated(bytes32 indexed accountHash, uint256 newBalance);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }
    
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not authorized relayer");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }
    
    /**
     * @notice Set the relayer address that can spend from the pool
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
     * @notice Deposit ETH to the privacy pool
     * @param accountHash Hash of the user's encrypted identity (computed off-chain)
     * @dev The accountHash links deposits to a user without revealing their wallet
     */
    function deposit(bytes32 accountHash) external payable {
        require(msg.value >= MIN_DEPOSIT, "Deposit below minimum");
        require(msg.value <= MAX_DEPOSIT, "Deposit above maximum");
        require(accountHash != bytes32(0), "Invalid account hash");
        
        _balances[accountHash] += msg.value;
        totalPoolBalance += msg.value;
        totalDeposits++;
        
        bytes32 depositId = keccak256(abi.encodePacked(accountHash, block.timestamp, msg.value));
        
        emit Deposited(depositId, msg.value, block.timestamp);
        emit BalanceUpdated(accountHash, _balances[accountHash]);
    }
    
    /**
     * @notice Withdraw ETH from the privacy pool
     * @param accountHash Hash of the user's encrypted identity
     * @param amount Amount to withdraw in wei
     * @param recipient Address to send the ETH to
     * @dev Called by relayer on behalf of the user
     */
    function withdraw(
        bytes32 accountHash,
        uint256 amount,
        address payable recipient
    ) external onlyRelayer {
        require(amount > 0, "Amount must be positive");
        require(_balances[accountHash] >= amount, "Insufficient balance");
        require(recipient != address(0), "Invalid recipient");
        
        _balances[accountHash] -= amount;
        totalPoolBalance -= amount;
        totalWithdrawals++;
        
        bytes32 withdrawalId = keccak256(abi.encodePacked(accountHash, block.timestamp, amount));
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Withdrawn(withdrawalId, amount, block.timestamp);
        emit BalanceUpdated(accountHash, _balances[accountHash]);
    }
    
    /**
     * @notice Deduct from user's pool balance for minting (called by relayer)
     * @param accountHash Hash of the user's encrypted identity
     * @param amount Amount to deduct for minting
     * @return success Whether the deduction was successful
     */
    function deductForMint(bytes32 accountHash, uint256 amount) external onlyRelayer returns (bool) {
        require(amount > 0, "Amount must be positive");
        require(_balances[accountHash] >= amount, "Insufficient pool balance");
        
        _balances[accountHash] -= amount;
        totalPoolBalance -= amount;
        
        (bool success, ) = relayer.call{value: amount}("");
        require(success, "Transfer to relayer failed");
        
        emit RelayerPayment(amount, block.timestamp);
        emit BalanceUpdated(accountHash, _balances[accountHash]);
        
        return true;
    }
    
    /**
     * @notice Get a user's pool balance
     * @param accountHash Hash of the user's encrypted identity
     * @return balance The user's pool balance in wei
     */
    function getBalance(bytes32 accountHash) external view returns (uint256) {
        return _balances[accountHash];
    }
    
    /**
     * @notice Check if user has sufficient balance for minting
     * @param accountHash Hash of the user's encrypted identity
     * @param amount Amount needed for minting
     * @return hasSufficient Whether the user has enough balance
     */
    function hasSufficientBalance(bytes32 accountHash, uint256 amount) external view returns (bool) {
        return _balances[accountHash] >= amount;
    }
    
    /**
     * @notice Get pool statistics
     * @return _totalBalance Total ETH in the pool
     * @return _totalDeposits Total number of deposits
     * @return _totalWithdrawals Total number of withdrawals
     */
    function getPoolStats() external view returns (
        uint256 _totalBalance,
        uint256 _totalDeposits,
        uint256 _totalWithdrawals
    ) {
        return (totalPoolBalance, totalDeposits, totalWithdrawals);
    }
    
    /**
     * @notice Emergency withdrawal by owner (for contract migration)
     * @param recipient Address to send funds to
     */
    function emergencyWithdraw(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        (bool success, ) = recipient.call{value: balance}("");
        require(success, "Transfer failed");
    }
    
    receive() external payable {
        revert("Use deposit function");
    }
}
