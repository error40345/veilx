import { 
  type Nft, 
  type InsertNft,
  type Listing,
  type InsertListing,
  type Trade,
  type InsertTrade,
  type Collection,
  type InsertCollection,
  type NftWithListing,
  type MarketStats,
  type PoolBalance,
  type InsertPoolBalance,
  type PoolTransaction,
  type InsertPoolTransaction,
  type Offer,
  type InsertOffer,
  collections,
  nfts,
  listings,
  trades,
  poolBalances,
  poolTransactions,
  offers,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, gte, lte, sql } from "drizzle-orm";

export interface Activity {
  id: string;
  type: 'mint' | 'list' | 'sale' | 'transfer';
  nftId: string;
  nftName: string;
  nftImage: string;
  price?: string;
  role?: 'buyer' | 'seller' | 'minter' | 'lister';
  timestamp: Date;
}

export interface NftFilters {
  search?: string;
  status?: 'all' | 'listed' | 'unlisted';
  sortBy?: 'newest' | 'oldest' | 'price_low' | 'price_high';
  minPrice?: number;
  maxPrice?: number;
}

export interface MintFromCollectionParams {
  collectionId: string;
  encryptedOwner: string;
}

export interface PoolMintFromCollectionParams {
  collectionId: string;
  encryptedOwner: string;
  accountHash: string;
  mintPrice: string;
  txHash: string;
  onChainTokenId: number;
}

export interface PoolMintResult {
  nft: Nft;
  updatedBalance: PoolBalance;
  transaction: PoolTransaction;
}

export interface IStorage {
  getCollections(): Promise<Collection[]>;
  getCollectionById(id: string): Promise<Collection | undefined>;
  getCollectionByOnChainId(onChainId: number): Promise<Collection | undefined>;
  getCollectionByContractAddress(contractAddress: string): Promise<Collection | undefined>;
  getCollectionsByCreator(encryptedCreator: string): Promise<Collection[]>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollectionMintedCount(collectionId: string, count: number): Promise<Collection | undefined>;
  mintFromCollection(params: MintFromCollectionParams): Promise<Nft>;

  getNfts(): Promise<NftWithListing[]>;
  getNftById(id: string): Promise<Nft | undefined>;
  getNftsByOwner(encryptedOwner: string): Promise<NftWithListing[]>;
  getNftsByCollection(collectionId: string): Promise<NftWithListing[]>;
  searchNfts(filters: NftFilters): Promise<NftWithListing[]>;
  createNft(nft: InsertNft): Promise<Nft>;
  updateNftOwner(nftId: string, encryptedOwner: string): Promise<Nft | undefined>;
  
  getActiveListings(): Promise<Listing[]>;
  getListingByNftId(nftId: string): Promise<Listing | undefined>;
  createListing(listing: InsertListing): Promise<Listing>;
  deactivateListing(listingId: string): Promise<void>;
  
  createTrade(trade: InsertTrade): Promise<Trade>;
  getTradesByNftId(nftId: string): Promise<Trade[]>;
  getAllTrades(): Promise<Trade[]>;
  getTradesByUser(encryptedAddress: string): Promise<Trade[]>;
  
  getRecentActivity(limit?: number): Promise<Activity[]>;
  getUserActivity(encryptedAddress: string): Promise<Activity[]>;
  
  getMarketStats(): Promise<MarketStats>;
  
  // Privacy Pool methods
  getPoolBalance(accountHash: string): Promise<PoolBalance | undefined>;
  getPoolBalanceByOwner(encryptedOwner: string): Promise<PoolBalance | undefined>;
  createOrUpdatePoolBalance(data: { accountHash: string; encryptedOwner: string; amount: string; type: 'deposit' | 'withdraw' | 'mint_payment' | 'nft_purchase' | 'nft_sale' }): Promise<PoolBalance>;
  recordPoolTransaction(data: InsertPoolTransaction): Promise<PoolTransaction>;
  getPoolTransactions(accountHash: string): Promise<PoolTransaction[]>;
  getPoolStats(): Promise<{ totalBalance: string; totalDeposits: number; totalUsers: number }>;
  
  // Atomic pool mint - wraps NFT creation, pool balance update, and transaction logging in one transaction
  poolMintFromCollection(params: PoolMintFromCollectionParams): Promise<PoolMintResult>;
  
  // Atomic pool buy - handles buyer debit, seller credit, ownership transfer, and listing deactivation atomically
  atomicPoolBuy(params: {
    nftId: string;
    listingId: string;
    buyerAccountHash: string;
    encryptedBuyer: string;
    encryptedSeller: string;
    price: string;
    txHash?: string;
  }): Promise<{ trade: Trade; buyerBalance: PoolBalance; sellerBalance: PoolBalance }>;
  
  // Offer methods
  createOffer(offer: InsertOffer): Promise<Offer>;
  getOfferById(id: string): Promise<Offer | undefined>;
  getOffersByNftId(nftId: string): Promise<Offer[]>;
  getOffersByOfferer(encryptedOfferer: string): Promise<Offer[]>;
  deactivateOffer(offerId: string): Promise<void>;
  deactivateAllOffersForNft(nftId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCollections(): Promise<Collection[]> {
    return db.select().from(collections).orderBy(desc(collections.createdAt));
  }

  async getCollectionById(id: string): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.id, id));
    return collection;
  }

  async getCollectionByOnChainId(onChainId: number): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.onChainId, onChainId));
    return collection;
  }

  async getCollectionByContractAddress(contractAddress: string): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.contractAddress, contractAddress));
    return collection;
  }

  async getCollectionsByCreator(encryptedCreator: string): Promise<Collection[]> {
    return db.select().from(collections)
      .where(eq(collections.encryptedCreator, encryptedCreator))
      .orderBy(desc(collections.createdAt));
  }

  async createCollection(insertCollection: InsertCollection): Promise<Collection> {
    const [collection] = await db.insert(collections).values({
      name: insertCollection.name,
      symbol: insertCollection.symbol,
      description: insertCollection.description || null,
      imageUrl: insertCollection.imageUrl,
      bannerUrl: insertCollection.bannerUrl || null,
      totalSupply: insertCollection.totalSupply,
      mintPrice: insertCollection.mintPrice,
      encryptedCreator: insertCollection.encryptedCreator,
      isActive: insertCollection.isActive ?? true,
      onChainId: insertCollection.onChainId,
      contractAddress: insertCollection.contractAddress,
    }).returning();
    return collection;
  }

  async updateCollectionMintedCount(collectionId: string, count: number): Promise<Collection | undefined> {
    const [updated] = await db.update(collections)
      .set({ mintedCount: count })
      .where(eq(collections.id, collectionId))
      .returning();
    return updated;
  }

  async mintFromCollection(params: MintFromCollectionParams): Promise<Nft> {
    const { collectionId, encryptedOwner } = params;
    
    return db.transaction(async (tx) => {
      const [collection] = await tx.select()
        .from(collections)
        .where(eq(collections.id, collectionId))
        .for('update');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      if (!collection.isActive) {
        throw new Error('Collection is not active');
      }
      
      if (collection.mintedCount >= collection.totalSupply) {
        throw new Error('Collection is sold out');
      }
      
      const tokenNumber = collection.mintedCount + 1;
      
      const [nft] = await tx.insert(nfts).values({
        collectionId,
        tokenId: tokenNumber,
        name: `${collection.name} #${tokenNumber}`,
        description: collection.description || null,
        imageUrl: collection.imageUrl,
        encryptedOwner,
        mintPrice: collection.mintPrice,
        isMinted: true,
      }).returning();
      
      await tx.update(collections)
        .set({ mintedCount: tokenNumber })
        .where(eq(collections.id, collectionId));
      
      return nft;
    });
  }

  async getNfts(): Promise<NftWithListing[]> {
    const allNfts = await db.select().from(nfts).orderBy(desc(nfts.createdAt));
    const nftsWithListings = await Promise.all(
      allNfts.map(async (nft) => {
        const listing = await this.getListingByNftId(nft.id);
        return {
          ...nft,
          listing: listing && listing.isActive ? listing : undefined,
        };
      })
    );
    return nftsWithListings;
  }

  async getNftById(id: string): Promise<Nft | undefined> {
    const [nft] = await db.select().from(nfts).where(eq(nfts.id, id));
    return nft;
  }

  async createNft(insertNft: InsertNft): Promise<Nft> {
    let tokenId = insertNft.tokenId;
    const collectionId = insertNft.collectionId || null;
    
    if (tokenId === undefined) {
      if (collectionId) {
        const [result] = await db.select({ maxId: sql<number>`COALESCE(MAX(token_id), 0)` })
          .from(nfts)
          .where(eq(nfts.collectionId, collectionId));
        tokenId = (result?.maxId || 0) + 1;
      } else {
        const [result] = await db.select({ maxId: sql<number>`COALESCE(MAX(token_id), 0)` })
          .from(nfts)
          .where(sql`collection_id IS NULL`);
        tokenId = (result?.maxId || 0) + 1;
      }
    }
    
    const [nft] = await db.insert(nfts).values({
      collectionId,
      tokenId,
      name: insertNft.name,
      description: insertNft.description || null,
      imageUrl: insertNft.imageUrl,
      encryptedOwner: insertNft.encryptedOwner,
      mintPrice: insertNft.mintPrice,
      isMinted: insertNft.isMinted ?? true,
    }).returning();
    return nft;
  }

  async getNftsByCollection(collectionId: string): Promise<NftWithListing[]> {
    const collectionNfts = await db.select().from(nfts)
      .where(eq(nfts.collectionId, collectionId))
      .orderBy(desc(nfts.createdAt));
    
    const nftsWithListings = await Promise.all(
      collectionNfts.map(async (nft) => {
        const listing = await this.getListingByNftId(nft.id);
        return {
          ...nft,
          listing: listing && listing.isActive ? listing : undefined,
        };
      })
    );
    return nftsWithListings;
  }

  async updateNftOwner(nftId: string, encryptedOwner: string): Promise<Nft | undefined> {
    const [updated] = await db.update(nfts)
      .set({ encryptedOwner })
      .where(eq(nfts.id, nftId))
      .returning();
    return updated;
  }

  async getActiveListings(): Promise<Listing[]> {
    return db.select().from(listings).where(eq(listings.isActive, true));
  }

  async getListingByNftId(nftId: string): Promise<Listing | undefined> {
    const [listing] = await db.select().from(listings)
      .where(and(eq(listings.nftId, nftId), eq(listings.isActive, true)));
    return listing;
  }

  async createListing(insertListing: InsertListing): Promise<Listing> {
    const existingListing = await this.getListingByNftId(insertListing.nftId);
    if (existingListing) {
      await this.deactivateListing(existingListing.id);
    }

    const [listing] = await db.insert(listings).values({
      nftId: insertListing.nftId,
      encryptedSeller: insertListing.encryptedSeller,
      price: insertListing.price,
      isActive: insertListing.isActive ?? true,
    }).returning();
    return listing;
  }

  async deactivateListing(listingId: string): Promise<void> {
    await db.update(listings)
      .set({ isActive: false })
      .where(eq(listings.id, listingId));
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const [trade] = await db.insert(trades).values({
      nftId: insertTrade.nftId,
      encryptedBuyer: insertTrade.encryptedBuyer,
      encryptedSeller: insertTrade.encryptedSeller,
      price: insertTrade.price,
    }).returning();
    return trade;
  }

  async getTradesByNftId(nftId: string): Promise<Trade[]> {
    return db.select().from(trades).where(eq(trades.nftId, nftId));
  }

  async getAllTrades(): Promise<Trade[]> {
    return db.select().from(trades).orderBy(desc(trades.timestamp));
  }

  async getTradesByUser(encryptedAddress: string): Promise<Trade[]> {
    return db.select().from(trades)
      .where(or(
        eq(trades.encryptedBuyer, encryptedAddress),
        eq(trades.encryptedSeller, encryptedAddress)
      ))
      .orderBy(desc(trades.timestamp));
  }

  async getNftsByOwner(encryptedOwner: string): Promise<NftWithListing[]> {
    const ownerNfts = await db.select().from(nfts)
      .where(eq(nfts.encryptedOwner, encryptedOwner));
    
    const nftsWithListings = await Promise.all(
      ownerNfts.map(async (nft) => {
        const listing = await this.getListingByNftId(nft.id);
        return {
          ...nft,
          listing: listing && listing.isActive ? listing : undefined,
        };
      })
    );
    return nftsWithListings;
  }

  async searchNfts(filters: NftFilters): Promise<NftWithListing[]> {
    let nftsWithListings = await this.getNfts();

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      nftsWithListings = nftsWithListings.filter(
        nft => nft.name.toLowerCase().includes(searchLower) ||
               (nft.description && nft.description.toLowerCase().includes(searchLower))
      );
    }

    if (filters.status === 'listed') {
      nftsWithListings = nftsWithListings.filter(nft => nft.listing?.isActive);
    } else if (filters.status === 'unlisted') {
      nftsWithListings = nftsWithListings.filter(nft => !nft.listing?.isActive);
    }

    if (filters.minPrice !== undefined) {
      nftsWithListings = nftsWithListings.filter(nft => {
        const price = parseFloat(nft.listing?.price || nft.mintPrice);
        return price >= filters.minPrice!;
      });
    }
    if (filters.maxPrice !== undefined) {
      nftsWithListings = nftsWithListings.filter(nft => {
        const price = parseFloat(nft.listing?.price || nft.mintPrice);
        return price <= filters.maxPrice!;
      });
    }

    if (filters.sortBy) {
      nftsWithListings.sort((a, b) => {
        switch (filters.sortBy) {
          case 'newest':
            return b.createdAt.getTime() - a.createdAt.getTime();
          case 'oldest':
            return a.createdAt.getTime() - b.createdAt.getTime();
          case 'price_low':
            const priceA = parseFloat(a.listing?.price || a.mintPrice);
            const priceB = parseFloat(b.listing?.price || b.mintPrice);
            return priceA - priceB;
          case 'price_high':
            const priceAH = parseFloat(a.listing?.price || a.mintPrice);
            const priceBH = parseFloat(b.listing?.price || b.mintPrice);
            return priceBH - priceAH;
          default:
            return 0;
        }
      });
    }

    return nftsWithListings;
  }

  async getRecentActivity(limit: number = 20): Promise<Activity[]> {
    const activities: Activity[] = [];
    const allNfts = await db.select().from(nfts);
    const allTrades = await db.select().from(trades);
    const allListings = await db.select().from(listings);

    for (const nft of allNfts) {
      activities.push({
        id: `mint-${nft.id}`,
        type: 'mint',
        nftId: nft.id,
        nftName: nft.name,
        nftImage: nft.imageUrl,
        price: nft.mintPrice,
        timestamp: nft.createdAt,
      });
    }

    for (const listing of allListings) {
      const nft = allNfts.find(n => n.id === listing.nftId);
      if (nft) {
        activities.push({
          id: `list-${listing.id}`,
          type: 'list',
          nftId: listing.nftId,
          nftName: nft.name,
          nftImage: nft.imageUrl,
          price: listing.price,
          timestamp: listing.createdAt,
        });
      }
    }

    for (const trade of allTrades) {
      const nft = allNfts.find(n => n.id === trade.nftId);
      if (nft) {
        activities.push({
          id: `sale-${trade.id}`,
          type: 'sale',
          nftId: trade.nftId,
          nftName: nft.name,
          nftImage: nft.imageUrl,
          price: trade.price,
          timestamp: trade.timestamp,
        });
      }
    }

    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getUserActivity(encryptedAddress: string): Promise<Activity[]> {
    const activities: Activity[] = [];
    const allNfts = await db.select().from(nfts);
    const allTrades = await db.select().from(trades);
    const allListings = await db.select().from(listings);

    for (const nft of allNfts) {
      if (nft.encryptedOwner === encryptedAddress) {
        activities.push({
          id: `mint-${nft.id}`,
          type: 'mint',
          nftId: nft.id,
          nftName: nft.name,
          nftImage: nft.imageUrl,
          price: nft.mintPrice,
          role: 'minter',
          timestamp: nft.createdAt,
        });
      }
    }

    for (const listing of allListings) {
      if (listing.encryptedSeller === encryptedAddress) {
        const nft = allNfts.find(n => n.id === listing.nftId);
        if (nft) {
          activities.push({
            id: `list-${listing.id}`,
            type: 'list',
            nftId: listing.nftId,
            nftName: nft.name,
            nftImage: nft.imageUrl,
            price: listing.price,
            role: 'lister',
            timestamp: listing.createdAt,
          });
        }
      }
    }

    for (const trade of allTrades) {
      const nft = allNfts.find(n => n.id === trade.nftId);
      if (nft) {
        if (trade.encryptedBuyer === encryptedAddress) {
          activities.push({
            id: `buy-${trade.id}`,
            type: 'sale',
            nftId: trade.nftId,
            nftName: nft.name,
            nftImage: nft.imageUrl,
            price: trade.price,
            role: 'buyer',
            timestamp: trade.timestamp,
          });
        }
        if (trade.encryptedSeller === encryptedAddress) {
          activities.push({
            id: `sell-${trade.id}`,
            type: 'sale',
            nftId: trade.nftId,
            nftName: nft.name,
            nftImage: nft.imageUrl,
            price: trade.price,
            role: 'seller',
            timestamp: trade.timestamp,
          });
        }
      }
    }

    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getMarketStats(): Promise<MarketStats> {
    const allNfts = await db.select().from(nfts);
    const activeListings = await this.getActiveListings();
    const allTrades = await db.select().from(trades);

    const totalVolume = allTrades.reduce((sum, trade) => {
      return sum + parseFloat(trade.price);
    }, 0);

    const floorPrice = activeListings.length > 0
      ? Math.min(...activeListings.map(l => parseFloat(l.price)))
      : 0;

    const uniqueHolders = new Set(allNfts.map(nft => nft.encryptedOwner));

    return {
      totalVolume: totalVolume.toFixed(2),
      floorPrice: floorPrice > 0 ? floorPrice.toFixed(2) : "—",
      totalSupply: allNfts.length,
      totalHolders: uniqueHolders.size,
      totalSales: allTrades.length,
      listedCount: activeListings.length,
    };
  }

  // ============ PRIVACY POOL METHODS ============

  async getPoolBalance(accountHash: string): Promise<PoolBalance | undefined> {
    const [balance] = await db.select().from(poolBalances)
      .where(eq(poolBalances.accountHash, accountHash));
    return balance;
  }

  async getPoolBalanceByOwner(encryptedOwner: string): Promise<PoolBalance | undefined> {
    const [balance] = await db.select().from(poolBalances)
      .where(eq(poolBalances.encryptedOwner, encryptedOwner));
    return balance;
  }

  async createOrUpdatePoolBalance(data: { 
    accountHash: string; 
    encryptedOwner: string; 
    amount: string; 
    type: 'deposit' | 'withdraw' | 'mint_payment' | 'nft_purchase' | 'nft_sale'
  }): Promise<PoolBalance> {
    const { accountHash, encryptedOwner, amount, type } = data;
    const amountNum = parseFloat(amount);
    
    return db.transaction(async (tx) => {
      const [existing] = await tx.select()
        .from(poolBalances)
        .where(eq(poolBalances.accountHash, accountHash))
        .for('update');

      if (existing) {
        const currentBalance = parseFloat(existing.balance);
        const currentDeposited = parseFloat(existing.totalDeposited);
        const currentSpent = parseFloat(existing.totalSpent);
        
        let newBalance: number;
        let newDeposited = currentDeposited;
        let newSpent = currentSpent;
        
        if (type === 'deposit' || type === 'nft_sale') {
          // Credits: deposits and NFT sale proceeds
          newBalance = currentBalance + amountNum;
          if (type === 'deposit') {
            newDeposited = currentDeposited + amountNum;
          }
        } else if (type === 'withdraw') {
          // Withdrawal debit
          newBalance = currentBalance - amountNum;
          if (newBalance < 0) throw new Error('Insufficient balance');
        } else {
          // mint_payment and nft_purchase are debits
          newBalance = currentBalance - amountNum;
          newSpent = currentSpent + amountNum;
          if (newBalance < 0) throw new Error('Insufficient balance for payment');
        }

        const [updated] = await tx.update(poolBalances)
          .set({
            balance: newBalance.toFixed(8),
            totalDeposited: newDeposited.toFixed(8),
            totalSpent: newSpent.toFixed(8),
            lastActivity: new Date(),
          })
          .where(eq(poolBalances.accountHash, accountHash))
          .returning();
        return updated;
      } else {
        // For new accounts, only allow credits (deposit or nft_sale)
        if (type !== 'deposit' && type !== 'nft_sale') {
          throw new Error('Cannot withdraw or spend without existing balance');
        }
        
        const [created] = await tx.insert(poolBalances).values({
          accountHash,
          encryptedOwner,
          balance: amount,
          totalDeposited: type === 'deposit' ? amount : "0",
          totalSpent: "0",
        }).returning();
        return created;
      }
    });
  }

  async recordPoolTransaction(data: InsertPoolTransaction): Promise<PoolTransaction> {
    const [transaction] = await db.insert(poolTransactions).values({
      accountHash: data.accountHash,
      type: data.type,
      amount: data.amount,
      txHash: data.txHash || null,
      nftId: data.nftId || null,
    }).returning();
    return transaction;
  }

  async getPoolTransactions(accountHash: string): Promise<PoolTransaction[]> {
    return db.select().from(poolTransactions)
      .where(eq(poolTransactions.accountHash, accountHash))
      .orderBy(desc(poolTransactions.timestamp));
  }

  async getPoolStats(): Promise<{ totalBalance: string; totalDeposits: number; totalUsers: number }> {
    const allBalances = await db.select().from(poolBalances);
    const allTransactions = await db.select().from(poolTransactions)
      .where(eq(poolTransactions.type, 'deposit'));

    const totalBalance = allBalances.reduce((sum, b) => sum + parseFloat(b.balance), 0);
    
    return {
      totalBalance: totalBalance.toFixed(4),
      totalDeposits: allTransactions.length,
      totalUsers: allBalances.length,
    };
  }

  async poolMintFromCollection(params: PoolMintFromCollectionParams): Promise<PoolMintResult> {
    const { collectionId, encryptedOwner, accountHash, mintPrice, txHash, onChainTokenId } = params;
    const amountNum = parseFloat(mintPrice);

    return db.transaction(async (tx) => {
      const [collection] = await tx.select()
        .from(collections)
        .where(eq(collections.id, collectionId))
        .for('update');
      
      if (!collection) {
        throw new Error('Collection not found');
      }
      
      if (!collection.isActive) {
        throw new Error('Collection is not active');
      }
      
      if (collection.mintedCount >= collection.totalSupply) {
        throw new Error('Collection is sold out');
      }
      
      const newMintedCount = collection.mintedCount + 1;
      
      const [nft] = await tx.insert(nfts).values({
        collectionId,
        tokenId: onChainTokenId,
        name: `${collection.name} #${onChainTokenId}`,
        description: collection.description || null,
        imageUrl: collection.imageUrl,
        encryptedOwner,
        mintPrice: collection.mintPrice,
        isMinted: true,
      }).returning();
      
      await tx.update(collections)
        .set({ mintedCount: newMintedCount })
        .where(eq(collections.id, collectionId));

      const [existingBalance] = await tx.select()
        .from(poolBalances)
        .where(eq(poolBalances.accountHash, accountHash))
        .for('update');

      if (!existingBalance) {
        throw new Error('Pool balance not found');
      }

      const currentBalance = parseFloat(existingBalance.balance);
      const currentSpent = parseFloat(existingBalance.totalSpent);
      
      if (currentBalance < amountNum) {
        throw new Error('Insufficient pool balance');
      }

      const newBalance = currentBalance - amountNum;
      const newSpent = currentSpent + amountNum;

      const [updatedBalance] = await tx.update(poolBalances)
        .set({
          balance: newBalance.toFixed(8),
          totalSpent: newSpent.toFixed(8),
          lastActivity: new Date(),
        })
        .where(eq(poolBalances.accountHash, accountHash))
        .returning();

      const [transaction] = await tx.insert(poolTransactions).values({
        accountHash,
        type: 'mint_payment',
        amount: mintPrice,
        txHash,
        nftId: nft.id,
      }).returning();

      return {
        nft,
        updatedBalance,
        transaction,
      };
    });
  }
  
  // Atomic pool buy - handles buyer debit, seller credit, ownership transfer, listing deactivation, and trade creation atomically
  async atomicPoolBuy(params: {
    nftId: string;
    listingId: string;
    buyerAccountHash: string;
    encryptedBuyer: string;
    encryptedSeller: string;
    price: string;
    txHash?: string;
  }): Promise<{ trade: Trade; buyerBalance: PoolBalance; sellerBalance: PoolBalance }> {
    const { nftId, listingId, buyerAccountHash, encryptedBuyer, encryptedSeller, price, txHash } = params;
    const priceNum = parseFloat(price);

    return db.transaction(async (tx) => {
      // 1. Get and lock buyer's pool balance (or create if doesn't exist)
      let [buyerPoolBalance] = await tx.select()
        .from(poolBalances)
        .where(eq(poolBalances.accountHash, buyerAccountHash))
        .for('update');

      // If buyer doesn't have a pool balance, they need to deposit first
      if (!buyerPoolBalance) {
        throw new Error('No pool balance found. Please deposit ETH to your privacy pool before making a private purchase.');
      }

      const buyerCurrentBalance = parseFloat(buyerPoolBalance.balance);
      if (buyerCurrentBalance < priceNum) {
        throw new Error(`Insufficient pool balance. You have ${buyerCurrentBalance.toFixed(8)} ETH but need ${priceNum.toFixed(8)} ETH. Please deposit more funds to your privacy pool.`);
      }

      // 2. Check if seller has existing pool balance
      // encryptedSeller is actually the account hash (keccak256 of lowercase address)
      const [existingSellerPool] = await tx.select()
        .from(poolBalances)
        .where(eq(poolBalances.accountHash, encryptedSeller))
        .for('update');

      // 3. Deduct from buyer
      const buyerNewBalance = buyerCurrentBalance - priceNum;
      const buyerNewSpent = parseFloat(buyerPoolBalance.totalSpent) + priceNum;

      const [updatedBuyerBalance] = await tx.update(poolBalances)
        .set({
          balance: buyerNewBalance.toFixed(8),
          totalSpent: buyerNewSpent.toFixed(8),
          lastActivity: new Date(),
        })
        .where(eq(poolBalances.accountHash, buyerAccountHash))
        .returning();

      // 4. Credit to seller
      let updatedSellerBalance: PoolBalance;
      if (existingSellerPool) {
        const sellerNewBalance = parseFloat(existingSellerPool.balance) + priceNum;
        const [updated] = await tx.update(poolBalances)
          .set({
            balance: sellerNewBalance.toFixed(8),
            lastActivity: new Date(),
          })
          .where(eq(poolBalances.accountHash, existingSellerPool.accountHash))
          .returning();
        updatedSellerBalance = updated;
      } else {
        // Create new pool for seller
        const [created] = await tx.insert(poolBalances).values({
          accountHash: encryptedSeller, // Use encryptedSeller as unique identifier
          encryptedOwner: encryptedSeller,
          balance: price,
          totalDeposited: "0",
          totalSpent: "0",
        }).returning();
        updatedSellerBalance = created;
      }

      // 5. Record pool transactions
      await tx.insert(poolTransactions).values({
        accountHash: buyerAccountHash,
        type: 'nft_purchase',
        amount: price,
        txHash: txHash || null,
        nftId,
      });

      await tx.insert(poolTransactions).values({
        accountHash: updatedSellerBalance.accountHash,
        type: 'nft_sale',
        amount: price,
        txHash: txHash || null,
        nftId,
      });

      // 6. Create trade record
      const [trade] = await tx.insert(trades).values({
        nftId,
        encryptedBuyer,
        encryptedSeller,
        price,
      }).returning();

      // 7. Update NFT ownership
      await tx.update(nfts)
        .set({ encryptedOwner: encryptedBuyer })
        .where(eq(nfts.id, nftId));

      // 8. Deactivate listing
      await tx.update(listings)
        .set({ isActive: false })
        .where(eq(listings.id, listingId));

      return {
        trade,
        buyerBalance: updatedBuyerBalance,
        sellerBalance: updatedSellerBalance,
      };
    });
  }

  // Offer methods
  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [newOffer] = await db.insert(offers).values(offer).returning();
    return newOffer;
  }
  
  async getOfferById(id: string): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id));
    return offer;
  }
  
  async getOffersByNftId(nftId: string): Promise<Offer[]> {
    return db.select()
      .from(offers)
      .where(and(eq(offers.nftId, nftId), eq(offers.isActive, true)))
      .orderBy(desc(offers.createdAt));
  }
  
  async getOffersByOfferer(encryptedOfferer: string): Promise<Offer[]> {
    return db.select()
      .from(offers)
      .where(and(eq(offers.encryptedOfferer, encryptedOfferer), eq(offers.isActive, true)))
      .orderBy(desc(offers.createdAt));
  }
  
  async deactivateOffer(offerId: string): Promise<void> {
    await db.update(offers)
      .set({ isActive: false })
      .where(eq(offers.id, offerId));
  }
  
  async deactivateAllOffersForNft(nftId: string): Promise<void> {
    await db.update(offers)
      .set({ isActive: false })
      .where(eq(offers.nftId, nftId));
  }
}

export const storage = new DatabaseStorage();
