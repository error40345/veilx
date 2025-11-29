import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, boolean, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// NFT Collection (Project) Schema - represents a launched collection
export const collections = pgTable("collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  onChainId: integer("on_chain_id"),
  contractAddress: text("contract_address"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  bannerUrl: text("banner_url"),
  totalSupply: integer("total_supply").notNull(),
  mintedCount: integer("minted_count").notNull().default(0),
  mintPrice: numeric("mint_price", { precision: 18, scale: 8 }).notNull(),
  encryptedCreator: text("encrypted_creator").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// NFT Item Schema - individual NFTs within a collection
export const nfts = pgTable("nfts", {
  collectionId: varchar("collection_id").references(() => collections.id),
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenId: integer("token_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  encryptedOwner: text("encrypted_owner").notNull(),
  mintPrice: numeric("mint_price", { precision: 18, scale: 8 }).notNull(),
  isMinted: boolean("is_minted").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => [
  unique("unique_collection_token").on(t.collectionId, t.tokenId).nullsNotDistinct(),
  uniqueIndex("unique_standalone_token").on(t.tokenId).where(sql`${t.collectionId} IS NULL`),
]);

// NFT Listings Schema (encrypted seller, public price)
export const listings = pgTable("listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nftId: varchar("nft_id").notNull().references(() => nfts.id),
  // Encrypted seller address
  encryptedSeller: text("encrypted_seller").notNull(),
  // Public listing price
  price: numeric("price", { precision: 18, scale: 8 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Trade History (encrypted buyer/seller, public price)
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nftId: varchar("nft_id").notNull().references(() => nfts.id),
  // Encrypted addresses
  encryptedBuyer: text("encrypted_buyer").notNull(),
  encryptedSeller: text("encrypted_seller").notNull(),
  // Public sale price
  price: numeric("price", { precision: 18, scale: 8 }).notNull(),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
});

// Privacy Pool - tracks user pool balances for anonymous minting
export const poolBalances = pgTable("pool_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Account hash - keccak256 of encrypted identity (used on-chain)
  accountHash: text("account_hash").notNull().unique(),
  // Encrypted owner identity (for user to prove ownership)
  encryptedOwner: text("encrypted_owner").notNull(),
  // Current balance in ETH (synced from blockchain)
  balance: numeric("balance", { precision: 18, scale: 8 }).notNull().default("0"),
  // Total deposited lifetime
  totalDeposited: numeric("total_deposited", { precision: 18, scale: 8 }).notNull().default("0"),
  // Total spent on minting
  totalSpent: numeric("total_spent", { precision: 18, scale: 8 }).notNull().default("0"),
  // Last activity timestamp
  lastActivity: timestamp("last_activity").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Pool transactions - deposit/withdraw/mint history
export const poolTransactions = pgTable("pool_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountHash: text("account_hash").notNull(),
  // Type: deposit, withdraw, mint_payment
  type: text("type").notNull(),
  // Amount in ETH
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  // Transaction hash on blockchain (for deposits/withdrawals)
  txHash: text("tx_hash"),
  // For mint payments, reference to the NFT
  nftId: varchar("nft_id").references(() => nfts.id),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
});

// NFT Offers Schema (encrypted offerer, public amount)
export const offers = pgTable("offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nftId: varchar("nft_id").notNull().references(() => nfts.id),
  // Encrypted offerer address
  encryptedOfferer: text("encrypted_offerer").notNull(),
  // Offer amount in ETH
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  // On-chain offer ID (if created via smart contract)
  onChainOfferId: integer("on_chain_offer_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Zod Schemas
export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  mintedCount: true,
  createdAt: true,
}).extend({
  onChainId: z.number().optional(),
  contractAddress: z.string().optional(),
});

export const insertNftSchema = createInsertSchema(nfts).omit({
  id: true,
  createdAt: true,
}).extend({
  tokenId: z.number().optional(),
});

export const insertListingSchema = createInsertSchema(listings).omit({
  id: true,
  createdAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  timestamp: true,
});

export const insertPoolBalanceSchema = createInsertSchema(poolBalances).omit({
  id: true,
  createdAt: true,
  lastActivity: true,
});

export const insertPoolTransactionSchema = createInsertSchema(poolTransactions).omit({
  id: true,
  timestamp: true,
});

export const insertOfferSchema = createInsertSchema(offers).omit({
  id: true,
  createdAt: true,
});

// TypeScript Types
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;

export type Nft = typeof nfts.$inferSelect;
export type InsertNft = z.infer<typeof insertNftSchema>;

export type Listing = typeof listings.$inferSelect;
export type InsertListing = z.infer<typeof insertListingSchema>;

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export type PoolBalance = typeof poolBalances.$inferSelect;
export type InsertPoolBalance = z.infer<typeof insertPoolBalanceSchema>;

export type PoolTransaction = typeof poolTransactions.$inferSelect;
export type InsertPoolTransaction = z.infer<typeof insertPoolTransactionSchema>;

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;

// Frontend Types
export interface NftWithListing extends Nft {
  listing?: Listing;
}

export interface MarketStats {
  totalVolume: string;
  floorPrice: string;
  totalSupply: number;
  totalHolders: number;
  totalSales: number;
  listedCount: number;
}

// Wallet Connection Types
export interface WalletState {
  address: string | null;
  isConnected: boolean;
  chainId: number | null;
}
