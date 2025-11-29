import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type NftFilters } from "./storage";
import { insertNftSchema, insertListingSchema, insertTradeSchema, insertCollectionSchema } from "@shared/schema";
import { z } from "zod";
import { 
  privateMintNFT, 
  privateMintFromCollection, 
  isRelayerConfigured, 
  getRelayerAddress, 
  getRelayerBalance,
  isPoolConfigured,
  getPoolContractAddress,
  getOnChainPoolBalance,
  hasSufficientPoolBalance,
  getOnChainPoolStats,
  withdrawFromPool,
  privateMintFromPool,
  listNFTViaRelayer,
  unlistNFTViaRelayer,
  buyNFTViaRelayer,
  isRelayerOwner,
  makeOfferViaRelayer,
  cancelOfferViaRelayer,
  acceptOfferViaRelayer,
  getOfferDetailsOnChain,
  getTokenOffersOnChain,
  checkOnChainListingStatus,
  getOnChainOwner,
} from "./relayer";
import { createServerEncryptedAddressInput, isServerFhevmConfigured } from "./fhevm-server";
import { verifySignature, type SignedRequest, type SignatureData } from "@shared/signing";
import { ethers } from "ethers";

// Signature verification schema for request bodies
const signedRequestSchema = z.object({
  signedRequest: z.object({
    data: z.any(),
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
    signer: z.string().regex(/^0x[a-fA-F0-9]{40}$/i, 'Invalid signer address'),
  }),
});

// Nonce tracking to prevent replay attacks
// Maps signer address to set of used nonces (storing as strings for consistency)
const usedNonces: Map<string, Set<string>> = new Map();

// Track nonce timestamps for cleanup
const nonceTimestamps: Map<string, number> = new Map();

// Maximum nonce age (5 minutes)
const NONCE_EXPIRY_MS = 5 * 60 * 1000;

// Clean up old nonces periodically (every minute)
setInterval(() => {
  const now = Date.now();
  const expiredNonces: string[] = [];
  
  nonceTimestamps.forEach((timestamp, nonceKey) => {
    if (now - timestamp > NONCE_EXPIRY_MS * 2) {
      expiredNonces.push(nonceKey);
    }
  });
  
  expiredNonces.forEach(nonceKey => {
    nonceTimestamps.delete(nonceKey);
    const [signer, nonce] = nonceKey.split(':');
    const signerNonces = usedNonces.get(signer);
    if (signerNonces) {
      signerNonces.delete(nonce);
      if (signerNonces.size === 0) {
        usedNonces.delete(signer);
      }
    }
  });
}, 60 * 1000);

// Helper to verify signed request and extract signer address
function verifySignedRequest<T extends SignatureData>(
  signedRequest: SignedRequest<T>,
  expectedAccountHash: string
): { valid: boolean; error?: string; signer?: string } {
  // Compute account hash from signer address
  const computedHash = ethers.keccak256(
    ethers.toUtf8Bytes(signedRequest.signer.toLowerCase())
  );
  
  // Verify signer owns this account hash
  if (computedHash !== expectedAccountHash) {
    return { 
      valid: false, 
      error: 'Signer address does not match account hash' 
    };
  }
  
  // Verify EIP-712 signature
  if (!verifySignature(signedRequest, signedRequest.signer)) {
    return { 
      valid: false, 
      error: 'Invalid signature' 
    };
  }
  
  // Check and consume nonce to prevent replay attacks
  const nonce = String(signedRequest.data.nonce);
  const expiresAt = signedRequest.data.expiresAt;
  const signerLower = signedRequest.signer.toLowerCase();
  
  // Verify request hasn't expired using expiresAt timestamp
  if (expiresAt && Date.now() / 1000 > expiresAt) {
    return { 
      valid: false, 
      error: 'Request expired' 
    };
  }
  
  // Check if nonce was already used
  if (!usedNonces.has(signerLower)) {
    usedNonces.set(signerLower, new Set());
  }
  const signerNonces = usedNonces.get(signerLower)!;
  
  if (signerNonces.has(nonce)) {
    return { 
      valid: false, 
      error: 'Replay attack detected: nonce already used' 
    };
  }
  
  // Mark nonce as used and track timestamp for cleanup
  signerNonces.add(nonce);
  nonceTimestamps.set(`${signerLower}:${nonce}`, Date.now());
  
  return { valid: true, signer: signedRequest.signer };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all NFTs with their listings - verifies on-chain status
  app.get("/api/nfts", async (_req, res) => {
    try {
      const nfts = await storage.getNfts();
      
      // Verify on-chain listing status for NFTs with active listings
      const verifiedNfts = await Promise.all(
        nfts.map(async (nft) => {
          if (nft.listing?.isActive && nft.collectionId) {
            try {
              const collection = await storage.getCollectionById(nft.collectionId);
              if (collection?.contractAddress && nft.tokenId !== undefined) {
                const onChainStatus = await checkOnChainListingStatus(
                  collection.contractAddress,
                  nft.tokenId
                );
                
                // If database says listed but on-chain says not listed, sync the database
                if (!onChainStatus.isListed) {
                  console.log(`[NFT Sync] Token ${nft.tokenId} not listed on-chain, syncing database`);
                  await storage.deactivateListing(nft.listing.id);
                  return { ...nft, listing: undefined };
                }
              }
            } catch (e) {
              console.warn(`[NFT Sync] Failed to verify on-chain status for token ${nft.tokenId}:`, e);
            }
          }
          return nft;
        })
      );
      
      res.json(verifiedNfts);
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      res.status(500).json({ error: "Failed to fetch NFTs" });
    }
  });

  // Get market statistics
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getMarketStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch market stats" });
    }
  });

  // Mint a standalone NFT (not part of a collection)
  app.post("/api/mint", async (req, res) => {
    try {
      const data = insertNftSchema.parse(req.body);
      
      if (data.collectionId) {
        return res.status(400).json({ 
          error: "Use /api/collections/:id/mint to mint NFTs within a collection" 
        });
      }
      
      const nft = await storage.createNft(data);
      res.status(201).json(nft);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error minting NFT:", error);
        res.status(500).json({ error: "Failed to mint NFT" });
      }
    }
  });

  // Private mint via relayer - hides minter's wallet from blockchain
  app.post("/api/mint/private", async (req, res) => {
    try {
      if (!isRelayerConfigured()) {
        return res.status(503).json({ 
          error: "Private minting not available - relayer not configured" 
        });
      }

      const privateMintSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        imageUrl: z.string().url(),
        mintPrice: z.string(),
        encryptedOwner: z.string(),
        encryptedHandle: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex format for encrypted handle'),
        inputProof: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex format for input proof'),
      });

      const data = privateMintSchema.parse(req.body);
      
      const uri = JSON.stringify({
        name: data.name,
        description: data.description || '',
        image: data.imageUrl,
      });

      console.log('[Private Mint] Received request:', {
        name: data.name,
        mintPrice: data.mintPrice,
        handleLength: data.encryptedHandle.length,
        proofLength: data.inputProof.length,
      });

      const result = await privateMintNFT({
        uri,
        mintPrice: data.mintPrice,
        encryptedOwner: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Private Mint] Relayer failed:', result.error);
        return res.status(500).json({ error: result.error || 'Minting failed' });
      }

      console.log('[Private Mint] Success! Token ID:', result.tokenId, 'TX:', result.txHash);

      const nft = await storage.createNft({
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        mintPrice: data.mintPrice,
        encryptedOwner: data.encryptedOwner,
        tokenId: result.tokenId,
      });

      res.status(201).json({
        ...nft,
        txHash: result.txHash,
        privateMint: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in private mint:", error);
        res.status(500).json({ error: "Failed to mint NFT privately" });
      }
    }
  });

  // Get relayer status (for frontend to check if private minting is available)
  app.get("/api/relayer/status", async (_req, res) => {
    try {
      const configured = isRelayerConfigured();
      
      if (!configured) {
        return res.json({ 
          available: false, 
          reason: "Relayer not configured" 
        });
      }

      const address = await getRelayerAddress();
      const balance = await getRelayerBalance();

      res.json({
        available: true,
        relayerAddress: address,
        balance: balance,
      });
    } catch (error) {
      console.error("Error checking relayer status:", error);
      res.json({ 
        available: false, 
        reason: "Failed to connect to relayer" 
      });
    }
  });

  // Create a listing
  app.post("/api/listings", async (req, res) => {
    try {
      const data = insertListingSchema.parse(req.body);
      
      // Verify NFT exists
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Verify the seller owns the NFT (encrypted address match)
      if (nft.encryptedOwner !== data.encryptedSeller) {
        return res.status(403).json({ error: "You don't own this NFT" });
      }

      const listing = await storage.createListing(data);
      res.status(201).json(listing);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating listing:", error);
        res.status(500).json({ error: "Failed to create listing" });
      }
    }
  });

  // Create a listing via relayer (for pool-minted NFTs where relayer is on-chain owner)
  // SECURED: Requires wallet signature
  app.post("/api/listings/relayer", async (req, res) => {
    try {
      if (!isRelayerConfigured()) {
        return res.status(503).json({ 
          error: "Relayer listing not available - relayer not configured" 
        });
      }

      const relayerListSchema = z.object({
        nftId: z.string(),
        price: z.string(),
        encryptedSeller: z.string(),
        encryptedHandle: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex format'),
        inputProof: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex format'),
        signedRequest: z.object({
          data: z.object({
            action: z.literal('list'),
            nftId: z.string(),
            price: z.string(),
            nonce: z.number(),
            expiresAt: z.number(),
          }),
          signature: z.string(),
          signer: z.string(),
        }),
      });

      const data = relayerListSchema.parse(req.body);
      
      // Verify wallet signature
      const verification = verifySignedRequest(data.signedRequest, data.encryptedSeller);
      if (!verification.valid) {
        console.log('[Relayer Listing] Signature verification failed:', verification.error);
        return res.status(401).json({ error: `Authorization failed: ${verification.error}` });
      }
      console.log('[Relayer Listing] Signature verified successfully');
      
      // Get NFT and verify ownership
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Verify the seller owns the NFT in our database
      if (nft.encryptedOwner !== data.encryptedSeller) {
        return res.status(403).json({ error: "You don't own this NFT" });
      }

      // Get the collection to find contract address
      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection?.contractAddress) {
        return res.status(400).json({ error: "Collection contract address not found" });
      }

      // Verify the relayer is the on-chain owner (for pool-minted NFTs)
      const relayerOwns = await isRelayerOwner(collection.contractAddress, nft.tokenId);
      if (!relayerOwns) {
        return res.status(400).json({ 
          error: "This NFT cannot be listed via relayer - relayer is not the on-chain owner. Use direct listing instead." 
        });
      }

      console.log('[Relayer Listing] Starting listing via relayer...');
      console.log('[Relayer Listing] NFT:', nft.id, 'Token ID:', nft.tokenId);
      console.log('[Relayer Listing] Price:', data.price, 'ETH');

      // Call the relayer to list the NFT on-chain
      const result = await listNFTViaRelayer({
        collectionAddress: collection.contractAddress,
        tokenId: nft.tokenId,
        price: data.price,
        encryptedSeller: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Relayer Listing] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Listing via relayer failed' });
      }

      console.log('[Relayer Listing] On-chain listing successful, tx:', result.txHash);

      // Create listing in database
      const listing = await storage.createListing({
        nftId: data.nftId,
        price: data.price,
        encryptedSeller: data.encryptedSeller,
      });

      res.status(201).json({
        ...listing,
        txHash: result.txHash,
        relayerListing: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in relayer listing:", error);
        res.status(500).json({ error: "Failed to list NFT via relayer" });
      }
    }
  });

  // Cancel listing via relayer (for pool-minted NFTs)
  // SECURED: Requires wallet signature
  app.post("/api/relayer/unlist", async (req, res) => {
    try {
      const unlistSchema = z.object({
        nftId: z.string(),
        encryptedOwner: z.string(),
        signedRequest: z.object({
          data: z.object({
            action: z.literal('unlist'),
            nftId: z.string(),
            nonce: z.number(),
            expiresAt: z.number(),
          }),
          signature: z.string(),
          signer: z.string(),
        }),
      });

      const data = unlistSchema.parse(req.body);
      
      // Verify wallet signature
      const verification = verifySignedRequest(data.signedRequest, data.encryptedOwner);
      if (!verification.valid) {
        console.log('[Relayer Unlist] Signature verification failed:', verification.error);
        return res.status(401).json({ error: `Authorization failed: ${verification.error}` });
      }
      console.log('[Relayer Unlist] Signature verified successfully');
      console.log('[Relayer Unlist] Canceling listing for NFT:', data.nftId);

      // Get the NFT
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }
      
      // Verify the signer owns the NFT
      if (nft.encryptedOwner !== data.encryptedOwner) {
        return res.status(403).json({ error: "You don't own this NFT" });
      }

      // Get the collection for contract address
      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection || !collection.contractAddress) {
        return res.status(400).json({ error: "Collection not deployed" });
      }

      // Get the listing
      const listing = await storage.getListingByNftId(data.nftId);
      if (!listing || !listing.isActive) {
        return res.status(400).json({ error: "NFT is not listed" });
      }

      // Check if relayer is the owner on-chain
      const relayerIsOwner = await isRelayerOwner(collection.contractAddress, nft.tokenId);
      if (!relayerIsOwner) {
        return res.status(400).json({ 
          error: "Relayer is not the on-chain owner. Use direct wallet unlisting instead.",
          needsDirectUnlist: true 
        });
      }

      // Unlist via relayer
      const result = await unlistNFTViaRelayer({
        collectionAddress: collection.contractAddress,
        tokenId: nft.tokenId,
      });

      if (!result.success) {
        // If the token is not listed on-chain, just sync the database
        if (result.error?.includes('is not listed')) {
          console.log('[Relayer Unlist] Token not listed on-chain, syncing database state');
          await storage.deactivateListing(listing.id);
          return res.json({
            success: true,
            synced: true,
            message: 'Database synced with on-chain state',
          });
        }
        console.error('[Relayer Unlist] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Unlisting via relayer failed' });
      }

      console.log('[Relayer Unlist] On-chain unlist successful, tx:', result.txHash);

      // Deactivate the listing in database
      await storage.deactivateListing(listing.id);

      res.json({
        success: true,
        txHash: result.txHash,
        relayerUnlist: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in relayer unlist:", error);
        res.status(500).json({ error: "Failed to unlist NFT via relayer" });
      }
    }
  });

  // Cancel listing (database only - for direct wallet unlisting after on-chain tx)
  app.post("/api/listings/cancel", async (req, res) => {
    try {
      const cancelSchema = z.object({
        nftId: z.string(),
      });

      const data = cancelSchema.parse(req.body);
      console.log('[Cancel Listing] Canceling database listing for NFT:', data.nftId);

      // Get the listing
      const listing = await storage.getListingByNftId(data.nftId);
      if (!listing || !listing.isActive) {
        return res.status(400).json({ error: "NFT is not listed" });
      }

      // Deactivate the listing in database
      await storage.deactivateListing(listing.id);

      res.json({
        success: true,
        message: 'Listing canceled successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error canceling listing:", error);
        res.status(500).json({ error: "Failed to cancel listing" });
      }
    }
  });

  // Make offer via relayer (for pool-based offers)
  app.post("/api/relayer/offer", async (req, res) => {
    try {
      const offerSchema = z.object({
        nftId: z.string(),
        amount: z.string(),
        encryptedOfferer: z.string(),
        encryptedHandle: z.string(),
        inputProof: z.string(),
      });

      const data = offerSchema.parse(req.body);
      console.log('[Relayer Offer] Making offer for NFT:', data.nftId);

      // Get the NFT
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Get the collection for contract address
      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection || !collection.contractAddress) {
        return res.status(400).json({ error: "Collection not deployed" });
      }

      // Make offer via relayer
      const result = await makeOfferViaRelayer({
        collectionAddress: collection.contractAddress,
        tokenId: nft.tokenId,
        amount: data.amount,
        encryptedOfferer: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Relayer Offer] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Making offer via relayer failed' });
      }

      console.log('[Relayer Offer] On-chain offer successful, tx:', result.txHash, 'offerId:', result.offerId);

      // Store offer in database
      const offer = await storage.createOffer({
        nftId: data.nftId,
        amount: data.amount,
        encryptedOfferer: data.encryptedOfferer,
        onChainOfferId: result.offerId,
      });

      res.status(201).json({
        ...offer,
        txHash: result.txHash,
        relayerOffer: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in relayer offer:", error);
        res.status(500).json({ error: "Failed to make offer via relayer" });
      }
    }
  });

  // Cancel offer via relayer
  app.post("/api/relayer/offer/cancel", async (req, res) => {
    try {
      const cancelSchema = z.object({
        offerId: z.string(),
      });

      const data = cancelSchema.parse(req.body);
      console.log('[Relayer Cancel Offer] Canceling offer:', data.offerId);

      // Get the offer
      const offer = await storage.getOfferById(data.offerId);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (!offer.isActive) {
        return res.status(400).json({ error: "Offer is not active" });
      }

      // Get the NFT and collection
      const nft = await storage.getNftById(offer.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection || !collection.contractAddress) {
        return res.status(400).json({ error: "Collection not deployed" });
      }

      // Cancel via relayer
      const result = await cancelOfferViaRelayer({
        collectionAddress: collection.contractAddress,
        offerId: offer.onChainOfferId!,
      });

      if (!result.success) {
        console.error('[Relayer Cancel Offer] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Canceling offer via relayer failed' });
      }

      console.log('[Relayer Cancel Offer] On-chain cancel successful, tx:', result.txHash);

      // Deactivate offer in database
      await storage.deactivateOffer(data.offerId);

      res.json({
        success: true,
        txHash: result.txHash,
        relayerCancel: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error canceling offer:", error);
        res.status(500).json({ error: "Failed to cancel offer via relayer" });
      }
    }
  });

  // Accept offer via relayer (for pool-minted NFTs)
  app.post("/api/relayer/offer/accept", async (req, res) => {
    try {
      const acceptSchema = z.object({
        offerId: z.string(),
        encryptedHandle: z.string(),
        inputProof: z.string(),
      });

      const data = acceptSchema.parse(req.body);
      console.log('[Relayer Accept Offer] Accepting offer:', data.offerId);

      // Get the offer
      const offer = await storage.getOfferById(data.offerId);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }

      if (!offer.isActive) {
        return res.status(400).json({ error: "Offer is not active" });
      }

      // Get the NFT and collection
      const nft = await storage.getNftById(offer.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection || !collection.contractAddress) {
        return res.status(400).json({ error: "Collection not deployed" });
      }

      // Check if relayer is the owner on-chain
      const relayerIsOwner = await isRelayerOwner(collection.contractAddress, nft.tokenId);
      if (!relayerIsOwner) {
        return res.status(400).json({ 
          error: "Relayer is not the on-chain owner. Use direct wallet accept instead.",
          needsDirectAccept: true 
        });
      }

      // Accept via relayer
      const result = await acceptOfferViaRelayer({
        collectionAddress: collection.contractAddress,
        offerId: offer.onChainOfferId!,
        encryptedNewOwner: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Relayer Accept Offer] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Accepting offer via relayer failed' });
      }

      console.log('[Relayer Accept Offer] On-chain accept successful, tx:', result.txHash);

      // Create trade record
      await storage.createTrade({
        nftId: offer.nftId,
        encryptedBuyer: offer.encryptedOfferer,
        encryptedSeller: nft.encryptedOwner,
        price: offer.amount,
      });

      // Transfer ownership to the offerer
      await storage.updateNftOwner(offer.nftId, offer.encryptedOfferer);

      // Deactivate the offer and all other offers for this NFT
      await storage.deactivateOffer(data.offerId);
      await storage.deactivateAllOffersForNft(offer.nftId);

      res.json({
        success: true,
        txHash: result.txHash,
        relayerAccept: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error accepting offer:", error);
        res.status(500).json({ error: "Failed to accept offer via relayer" });
      }
    }
  });

  // Get offers for an NFT
  app.get("/api/nfts/:id/offers", async (req, res) => {
    try {
      const offers = await storage.getOffersByNftId(req.params.id);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).json({ error: "Failed to fetch offers" });
    }
  });

  // Record offer in database (after successful on-chain transaction via MetaMask)
  app.post("/api/offers/record", async (req, res) => {
    try {
      const offerSchema = z.object({
        nftId: z.string(),
        amount: z.string(),
        encryptedOfferer: z.string(),
        onChainOfferId: z.number(),
        txHash: z.string(),
      });

      const data = offerSchema.parse(req.body);
      console.log('[Record Offer] Recording offer for NFT:', data.nftId, 'offerId:', data.onChainOfferId);

      // Verify NFT exists
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Store offer in database
      const offer = await storage.createOffer({
        nftId: data.nftId,
        amount: data.amount,
        encryptedOfferer: data.encryptedOfferer,
        onChainOfferId: data.onChainOfferId,
      });

      console.log('[Record Offer] Offer recorded in database:', offer.id);

      res.status(201).json({
        ...offer,
        txHash: data.txHash,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error recording offer:", error);
        res.status(500).json({ error: "Failed to record offer" });
      }
    }
  });

  // Create offer via relayer (for pool-minted NFTs when relayer is needed)
  app.post("/api/offers", async (req, res) => {
    try {
      const offerSchema = z.object({
        nftId: z.string(),
        amount: z.string(),
        encryptedOfferer: z.string(),
        encryptedHandle: z.string(),
        inputProof: z.string(),
      });

      const data = offerSchema.parse(req.body);
      console.log('[Make Offer] Creating offer for NFT via relayer:', data.nftId);

      // Get the NFT
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Get the collection
      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection || !collection.contractAddress) {
        return res.status(400).json({ error: "Collection not deployed" });
      }

      // Route through relayer for on-chain offer creation
      const result = await makeOfferViaRelayer({
        collectionAddress: collection.contractAddress,
        tokenId: nft.tokenId,
        amount: data.amount,
        encryptedOfferer: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Make Offer] Relayer failed:', result.error);
        return res.status(500).json({ error: result.error || 'Making offer failed' });
      }

      console.log('[Make Offer] On-chain offer successful, tx:', result.txHash, 'offerId:', result.offerId);

      // Store offer in database
      const offer = await storage.createOffer({
        nftId: data.nftId,
        amount: data.amount,
        encryptedOfferer: data.encryptedOfferer,
        onChainOfferId: result.offerId,
      });

      res.status(201).json({
        ...offer,
        txHash: result.txHash,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating offer:", error);
        res.status(500).json({ error: "Failed to create offer" });
      }
    }
  });

  // Buy an NFT
  app.post("/api/buy", async (req, res) => {
    try {
      const buySchema = z.object({
        nftId: z.string(),
        listingId: z.string(),
        encryptedBuyer: z.string(),
      });

      const { nftId, listingId, encryptedBuyer } = buySchema.parse(req.body);

      // Verify NFT exists
      const nft = await storage.getNftById(nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Get collection for on-chain check
      const collection = await storage.getCollectionById(nft.collectionId);

      // Verify listing exists and is active
      const listing = await storage.getListingByNftId(nftId);
      if (!listing || !listing.isActive || listing.id !== listingId) {
        return res.status(400).json({ error: "NFT is not listed for sale" });
      }

      // CRITICAL: Verify on-chain listing status
      if (collection?.contractAddress && nft.tokenId !== undefined) {
        const onChainStatus = await checkOnChainListingStatus(
          collection.contractAddress,
          nft.tokenId
        );
        
        if (!onChainStatus.isListed) {
          console.log(`[Buy] Token ${nft.tokenId} not listed on-chain, syncing database`);
          await storage.deactivateListing(listing.id);
          return res.status(400).json({ 
            error: "NFT is no longer listed for sale. The listing has been updated." 
          });
        }
      }

      // Prevent buying your own NFT
      if (nft.encryptedOwner === encryptedBuyer) {
        return res.status(400).json({ error: "You already own this NFT" });
      }

      // Create trade record
      await storage.createTrade({
        nftId,
        encryptedBuyer,
        encryptedSeller: listing.encryptedSeller,
        price: listing.price,
      });

      // Transfer ownership (update encrypted owner)
      await storage.updateNftOwner(nftId, encryptedBuyer);

      // Deactivate the listing
      await storage.deactivateListing(listingId);

      res.json({ 
        success: true, 
        message: "NFT purchased successfully",
        price: listing.price,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error buying NFT:", error);
        res.status(500).json({ error: "Failed to purchase NFT" });
      }
    }
  });

  // Private buy via relayer - hides buyer's wallet from blockchain
  // Uses pool balances: buyer pays from pool, seller receives to pool
  // SECURED: Requires wallet signature
  app.post("/api/buy/private", async (req, res) => {
    try {
      if (!isRelayerConfigured()) {
        return res.status(503).json({ 
          error: "Private buying not available - relayer not configured" 
        });
      }

      if (!isServerFhevmConfigured()) {
        return res.status(503).json({ 
          error: "Private buying not available - server-side FHEVM not configured" 
        });
      }

      const privateBuySchema = z.object({
        nftId: z.string(),
        encryptedBuyer: z.string(),
        buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/i, 'Invalid Ethereum address'),
        accountHash: z.string(), // Required - must use pool for privacy
        signedRequest: z.object({
          data: z.object({
            action: z.literal('buy'),
            nftId: z.string(),
            price: z.string(),
            nonce: z.number(),
            expiresAt: z.number(),
          }),
          signature: z.string(),
          signer: z.string(),
        }),
      });

      const data = privateBuySchema.parse(req.body);
      
      // Verify wallet signature
      const verification = verifySignedRequest(data.signedRequest, data.accountHash);
      if (!verification.valid) {
        console.log('[Private Buy] Signature verification failed:', verification.error);
        return res.status(401).json({ error: `Authorization failed: ${verification.error}` });
      }
      console.log('[Private Buy] Signature verified successfully');
      console.log('[Private Buy] Received request for NFT:', data.nftId);

      // Get the NFT
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Get the collection for contract address first (needed for on-chain check)
      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection?.contractAddress) {
        return res.status(400).json({ error: "Collection contract address not found" });
      }

      // Verify listing exists and is active in database
      const listing = await storage.getListingByNftId(data.nftId);
      if (!listing || !listing.isActive) {
        return res.status(400).json({ error: "NFT is not listed for sale" });
      }

      // CRITICAL: Verify on-chain listing status before proceeding
      console.log('[Private Buy] Verifying on-chain listing status...');
      const onChainStatus = await checkOnChainListingStatus(
        collection.contractAddress,
        nft.tokenId
      );
      
      if (!onChainStatus.isListed) {
        // Sync database with on-chain state
        console.log('[Private Buy] NFT not listed on-chain, syncing database');
        await storage.deactivateListing(listing.id);
        return res.status(400).json({ 
          error: "NFT is no longer listed for sale. The listing has been updated." 
        });
      }
      console.log('[Private Buy] On-chain listing verified');

      // Prevent buying your own NFT
      if (nft.encryptedOwner === data.encryptedBuyer) {
        return res.status(400).json({ error: "You already own this NFT" });
      }

      // Check buyer's pool balance in DATABASE - REQUIRED for privacy
      // Must check database balance since atomicPoolBuy uses database, not on-chain contract
      const buyerPoolBalance = await storage.getPoolBalance(data.accountHash);
      if (!buyerPoolBalance) {
        return res.status(400).json({ 
          error: "No pool balance found. Please deposit ETH to your privacy pool first." 
        });
      }
      
      const buyerBalance = parseFloat(buyerPoolBalance.balance);
      const requiredAmount = parseFloat(listing.price);
      if (buyerBalance < requiredAmount) {
        return res.status(400).json({ 
          error: `Insufficient pool balance. You have ${buyerBalance.toFixed(8)} ETH but need ${requiredAmount.toFixed(8)} ETH. Please deposit more funds.` 
        });
      }
      console.log('[Private Buy] Pool balance verified:', buyerBalance, 'ETH available');
      
      console.log('[Private Buy] Creating server-side encrypted input...');
      console.log('[Private Buy] Collection:', collection.contractAddress);
      console.log('[Private Buy] Token ID:', nft.tokenId);
      console.log('[Private Buy] Price:', listing.price, 'ETH');

      // Create encrypted input on server using relayer's wallet
      const encryptedInput = await createServerEncryptedAddressInput(
        collection.contractAddress,
        data.buyerAddress
      );

      console.log('[Private Buy] Server encryption successful');
      console.log('[Private Buy] Executing buy via relayer...');

      // Execute the buy via relayer with server-generated encrypted input
      const result = await buyNFTViaRelayer({
        collectionAddress: collection.contractAddress,
        tokenId: nft.tokenId,
        price: listing.price,
        encryptedBuyer: encryptedInput.handle,
        inputProof: encryptedInput.proof,
      });

      if (!result.success) {
        console.error('[Private Buy] Relayer failed:', result.error);
        return res.status(500).json({ error: result.error || 'Private buy failed' });
      }

      console.log('[Private Buy] Success! TX:', result.txHash);

      // Perform atomic pool buy - all operations in a single transaction
      // This ensures buyer debit, seller credit, ownership transfer, and listing deactivation happen atomically
      console.log('[Private Buy] Processing atomic pool transaction...');
      const poolResult = await storage.atomicPoolBuy({
        nftId: data.nftId,
        listingId: listing.id,
        buyerAccountHash: data.accountHash,
        encryptedBuyer: data.encryptedBuyer,
        encryptedSeller: listing.encryptedSeller,
        price: listing.price,
        txHash: result.txHash,
      });

      console.log('[Private Buy] Complete! Buyer paid from pool, seller credited to pool');
      console.log('[Private Buy] Buyer new balance:', poolResult.buyerBalance.balance);
      console.log('[Private Buy] Seller new balance:', poolResult.sellerBalance.balance);

      res.json({
        success: true,
        message: "NFT purchased privately! Payment processed through privacy pool.",
        txHash: result.txHash,
        privateBuy: true,
        price: listing.price,
        poolPayment: true, // Indicates pool was used for payment
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in private buy:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: `Failed to purchase NFT privately: ${errorMessage}` });
      }
    }
  });

  // Pool-based private buy - uses deposited funds for complete anonymity
  app.post("/api/pool/buy", async (req, res) => {
    try {
      if (!isPoolConfigured()) {
        return res.status(503).json({ 
          error: "Pool buying not available - pool not configured" 
        });
      }

      const poolBuySchema = z.object({
        nftId: z.string(),
        accountHash: z.string(),
        encryptedBuyer: z.string(),
        encryptedHandle: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex format'),
        inputProof: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex format'),
      });

      const data = poolBuySchema.parse(req.body);
      console.log('[Pool Buy] Received request for NFT:', data.nftId);

      // Get the NFT
      const nft = await storage.getNftById(data.nftId);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      // Get the collection for contract address first (needed for on-chain check)
      const collection = await storage.getCollectionById(nft.collectionId);
      if (!collection?.contractAddress) {
        return res.status(400).json({ error: "Collection contract address not found" });
      }

      // Verify listing exists and is active in database
      const listing = await storage.getListingByNftId(data.nftId);
      if (!listing || !listing.isActive) {
        return res.status(400).json({ error: "NFT is not listed for sale" });
      }

      // CRITICAL: Verify on-chain listing status before proceeding
      console.log('[Pool Buy] Verifying on-chain listing status...');
      const onChainStatus = await checkOnChainListingStatus(
        collection.contractAddress,
        nft.tokenId
      );
      
      if (!onChainStatus.isListed) {
        // Sync database with on-chain state
        console.log('[Pool Buy] NFT not listed on-chain, syncing database');
        await storage.deactivateListing(listing.id);
        return res.status(400).json({ 
          error: "NFT is no longer listed for sale. The listing has been updated." 
        });
      }
      console.log('[Pool Buy] On-chain listing verified');

      // Prevent buying your own NFT
      if (nft.encryptedOwner === data.encryptedBuyer) {
        return res.status(400).json({ error: "You already own this NFT" });
      }

      // Check buyer's pool balance in DATABASE 
      // Must check database balance since it's what gets deducted
      const buyerPoolBalance = await storage.getPoolBalance(data.accountHash);
      if (!buyerPoolBalance) {
        return res.status(400).json({ 
          error: "No pool balance found. Please deposit ETH to your privacy pool first." 
        });
      }
      
      const buyerBalance = parseFloat(buyerPoolBalance.balance);
      const requiredAmount = parseFloat(listing.price);
      if (buyerBalance < requiredAmount) {
        return res.status(400).json({ 
          error: `Insufficient pool balance. You have ${buyerBalance.toFixed(8)} ETH but need ${requiredAmount.toFixed(8)} ETH. Please deposit more funds.` 
        });
      }
      console.log('[Pool Buy] Balance verified:', buyerBalance, 'ETH available');

      console.log('[Pool Buy] Executing buy via pool...');
      console.log('[Pool Buy] Account hash:', data.accountHash);
      console.log('[Pool Buy] Price:', listing.price, 'ETH');

      // Execute the buy via relayer (relayer pays, we deduct from pool)
      const result = await buyNFTViaRelayer({
        collectionAddress: collection.contractAddress,
        tokenId: nft.tokenId,
        price: listing.price,
        encryptedBuyer: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Pool Buy] Relayer failed:', result.error);
        return res.status(500).json({ error: result.error || 'Pool buy failed' });
      }

      console.log('[Pool Buy] Success! TX:', result.txHash);

      // Create trade record
      await storage.createTrade({
        nftId: data.nftId,
        encryptedBuyer: data.encryptedBuyer,
        encryptedSeller: listing.encryptedSeller,
        price: listing.price,
      });

      // Transfer ownership
      await storage.updateNftOwner(data.nftId, data.encryptedBuyer);

      // Deactivate the listing
      await storage.deactivateListing(listing.id);

      res.json({
        success: true,
        message: "NFT purchased anonymously via privacy pool",
        txHash: result.txHash,
        poolBuy: true,
        price: listing.price,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in pool buy:", error);
        res.status(500).json({ error: "Failed to purchase NFT via pool" });
      }
    }
  });

  // Get NFT details - verifies on-chain listing status
  app.get("/api/nfts/:id", async (req, res) => {
    try {
      const nft = await storage.getNftById(req.params.id);
      if (!nft) {
        return res.status(404).json({ error: "NFT not found" });
      }

      let listing = await storage.getListingByNftId(nft.id);
      const trades = await storage.getTradesByNftId(nft.id);

      // Verify on-chain listing status if there's an active listing
      if (listing && listing.isActive && nft.collectionId) {
        try {
          const collection = await storage.getCollectionById(nft.collectionId);
          if (collection?.contractAddress && nft.tokenId !== undefined) {
            const onChainStatus = await checkOnChainListingStatus(
              collection.contractAddress,
              nft.tokenId
            );
            
            if (!onChainStatus.isListed) {
              console.log(`[NFT Details] Token ${nft.tokenId} not listed on-chain, syncing database`);
              await storage.deactivateListing(listing.id);
              listing = undefined;
            }
          }
        } catch (e) {
          console.warn(`[NFT Details] Failed to verify on-chain status:`, e);
        }
      }

      res.json({
        ...nft,
        listing: listing && listing.isActive ? listing : undefined,
        trades,
      });
    } catch (error) {
      console.error("Error fetching NFT details:", error);
      res.status(500).json({ error: "Failed to fetch NFT details" });
    }
  });

  // Search and filter NFTs
  app.get("/api/nfts/search", async (req, res) => {
    try {
      const filters: NftFilters = {
        search: req.query.search as string | undefined,
        status: req.query.status as 'all' | 'listed' | 'unlisted' | undefined,
        sortBy: req.query.sortBy as 'newest' | 'oldest' | 'price_low' | 'price_high' | undefined,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      };

      const nfts = await storage.searchNfts(filters);
      res.json(nfts);
    } catch (error) {
      console.error("Error searching NFTs:", error);
      res.status(500).json({ error: "Failed to search NFTs" });
    }
  });

  // Get NFTs owned by a user (profile) - verifies on-chain listing status
  app.get("/api/profile/:encryptedAddress", async (req, res) => {
    try {
      const { encryptedAddress } = req.params;
      
      const ownedNfts = await storage.getNftsByOwner(encryptedAddress);
      const userActivity = await storage.getUserActivity(encryptedAddress);
      const userTrades = await storage.getTradesByUser(encryptedAddress);

      // Verify on-chain listing status for owned NFTs
      const verifiedNfts = await Promise.all(
        ownedNfts.map(async (nft) => {
          if (nft.listing?.isActive && nft.collectionId) {
            try {
              const collection = await storage.getCollectionById(nft.collectionId);
              if (collection?.contractAddress && nft.tokenId !== undefined) {
                const onChainStatus = await checkOnChainListingStatus(
                  collection.contractAddress,
                  nft.tokenId
                );
                
                // If database says listed but on-chain says not listed, sync
                if (!onChainStatus.isListed) {
                  console.log(`[Profile Sync] Token ${nft.tokenId} not listed on-chain, syncing database`);
                  await storage.deactivateListing(nft.listing.id);
                  return { ...nft, listing: undefined };
                }
              }
            } catch (e) {
              console.warn(`[Profile Sync] Failed to verify on-chain status for token ${nft.tokenId}:`, e);
            }
          }
          return nft;
        })
      );

      // Calculate user stats
      const totalSpent = userTrades
        .filter(t => t.encryptedBuyer === encryptedAddress)
        .reduce((sum, t) => sum + parseFloat(t.price), 0);
      
      const totalEarned = userTrades
        .filter(t => t.encryptedSeller === encryptedAddress)
        .reduce((sum, t) => sum + parseFloat(t.price), 0);

      res.json({
        ownedNfts: verifiedNfts,
        activity: userActivity,
        stats: {
          nftsOwned: verifiedNfts.length,
          totalSpent: totalSpent.toFixed(2),
          totalEarned: totalEarned.toFixed(2),
          totalTrades: userTrades.length,
        },
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Get recent activity feed
  app.get("/api/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const activity = await storage.getRecentActivity(limit);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  // Get all trades (for activity page)
  app.get("/api/trades", async (req, res) => {
    try {
      const trades = await storage.getAllTrades();
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // ============ COLLECTION ROUTES ============

  // Get all collections
  app.get("/api/collections", async (_req, res) => {
    try {
      const collections = await storage.getCollections();
      res.json(collections);
    } catch (error) {
      console.error("Error fetching collections:", error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  // Get a single collection by ID (supports both UUID and on-chain ID)
  app.get("/api/collections/:id", async (req, res) => {
    try {
      const idParam = req.params.id;
      let collection = await storage.getCollectionById(idParam);
      
      // If not found by UUID, try looking up by on-chain ID
      if (!collection) {
        const onChainId = parseInt(idParam);
        if (!isNaN(onChainId)) {
          collection = await storage.getCollectionByOnChainId(onChainId);
        }
      }
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      const nfts = await storage.getNftsByCollection(collection.id);
      res.json({ ...collection, nfts });
    } catch (error) {
      console.error("Error fetching collection:", error);
      res.status(500).json({ error: "Failed to fetch collection" });
    }
  });

  // Create/Launch a new collection
  app.post("/api/collections", async (req, res) => {
    try {
      const data = insertCollectionSchema.parse(req.body);
      const collection = await storage.createCollection(data);
      res.status(201).json(collection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating collection:", error);
        res.status(500).json({ error: "Failed to create collection" });
      }
    }
  });

  // Mint NFT from a collection (supports both UUID and on-chain ID)
  app.post("/api/collections/:id/mint", async (req, res) => {
    try {
      const idParam = req.params.id;
      let collection = await storage.getCollectionById(idParam);
      
      // If not found by UUID, try looking up by on-chain ID
      if (!collection) {
        const onChainId = parseInt(idParam);
        if (!isNaN(onChainId)) {
          collection = await storage.getCollectionByOnChainId(onChainId);
        }
      }
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      const mintSchema = z.object({
        encryptedOwner: z.string(),
      });

      const { encryptedOwner } = mintSchema.parse(req.body);

      const nft = await storage.mintFromCollection({
        collectionId: collection.id,
        encryptedOwner,
      });

      res.status(201).json(nft);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else if (error instanceof Error) {
        if (error.message === 'Collection not found') {
          res.status(404).json({ error: error.message });
        } else if (error.message === 'Collection is not active' || error.message === 'Collection is sold out') {
          res.status(400).json({ error: error.message });
        } else {
          console.error("Error minting from collection:", error);
          res.status(500).json({ error: "Failed to mint NFT" });
        }
      } else {
        console.error("Error minting from collection:", error);
        res.status(500).json({ error: "Failed to mint NFT" });
      }
    }
  });

  // Get collections by creator
  app.get("/api/creators/:encryptedAddress/collections", async (req, res) => {
    try {
      const { encryptedAddress } = req.params;
      const collections = await storage.getCollectionsByCreator(encryptedAddress);
      res.json(collections);
    } catch (error) {
      console.error("Error fetching creator collections:", error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  // Pool mint from collection - anonymous minting using pool funds
  // SECURED: Requires wallet signature
  app.post("/api/collections/pool-mint", async (req, res) => {
    try {
      if (!isPoolConfigured()) {
        return res.status(503).json({ 
          error: "Privacy pool not available for minting" 
        });
      }

      const poolMintSchema = z.object({
        collectionId: z.string(),
        collectionAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid collection address'),
        tokenUri: z.string(),
        mintPrice: z.string(),
        accountHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid account hash'),
        encryptedOwner: z.string(),
        encryptedHandle: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex format for encrypted handle'),
        inputProof: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex format for input proof'),
        signedRequest: z.object({
          data: z.object({
            action: z.literal('mint'),
            collectionId: z.string(),
            mintPrice: z.string(),
            nonce: z.number(),
            expiresAt: z.number(),
          }),
          signature: z.string(),
          signer: z.string(),
        }),
      });

      const data = poolMintSchema.parse(req.body);
      
      // Verify wallet signature
      const verification = verifySignedRequest(data.signedRequest, data.accountHash);
      if (!verification.valid) {
        console.log('[Collection Pool Mint] Signature verification failed:', verification.error);
        return res.status(401).json({ error: `Authorization failed: ${verification.error}` });
      }
      console.log('[Collection Pool Mint] Signature verified successfully');
      
      // Pre-flight checks - verify everything before any on-chain operations
      
      // 1. Check collection exists and is mintable
      // Try multiple lookup strategies: database ID, on-chain ID, or contract address
      let collection = await storage.getCollectionById(data.collectionId);
      
      // If not found by database ID, try by on-chain ID (for deployed collections)
      if (!collection) {
        const onChainId = parseInt(data.collectionId);
        if (!isNaN(onChainId)) {
          collection = await storage.getCollectionByOnChainId(onChainId);
        }
      }
      
      // If still not found, try by contract address
      if (!collection) {
        collection = await storage.getCollectionByContractAddress(data.collectionAddress);
      }
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      if (!collection.isActive) {
        return res.status(400).json({ error: "Collection is not active" });
      }
      if (collection.mintedCount >= collection.totalSupply) {
        return res.status(400).json({ error: "Collection is sold out" });
      }
      
      // 2. Check pool balance
      const poolBalance = await storage.getPoolBalance(data.accountHash);
      if (!poolBalance || parseFloat(poolBalance.balance) < parseFloat(data.mintPrice)) {
        return res.status(400).json({ 
          error: "Insufficient pool balance. Please deposit more ETH to your privacy pool." 
        });
      }

      console.log('[Collection Pool Mint] Pre-flight checks passed');
      console.log('[Collection Pool Mint] Starting anonymous mint from pool...');
      console.log('[Collection Pool Mint] Collection:', data.collectionAddress);
      console.log('[Collection Pool Mint] Account hash:', data.accountHash.substring(0, 10) + '...');

      // Import the privateMintFromCollection function for pool minting
      const { privateMintFromCollection } = await import('./relayer');
      
      // First deduct from pool
      const { deductFromPool } = await import('./relayer');
      const deductResult = await deductFromPool(data.accountHash, data.mintPrice);
      
      if (!deductResult.success) {
        console.error('[Collection Pool Mint] Pool deduction failed:', deductResult.error);
        return res.status(500).json({ error: `Pool deduction failed: ${deductResult.error}` });
      }

      console.log('[Collection Pool Mint] Pool deduction successful');

      // Now mint using relayer
      const result = await privateMintFromCollection({
        collectionAddress: data.collectionAddress,
        tokenUri: data.tokenUri,
        mintPrice: data.mintPrice,
        encryptedOwner: data.encryptedHandle,
        inputProof: data.inputProof,
      });

      if (!result.success) {
        console.error('[Collection Pool Mint] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Minting failed' });
      }

      console.log('[Collection Pool Mint] Success! On-chain token ID:', result.tokenId);

      // Use atomic storage method that wraps NFT creation, pool balance update, 
      // and transaction logging in a single database transaction
      // Use collection.id (database ID) rather than data.collectionId (might be on-chain ID)
      // Pass the actual on-chain token ID to ensure database matches blockchain
      const dbResult = await storage.poolMintFromCollection({
        collectionId: collection.id,
        encryptedOwner: data.encryptedOwner,
        accountHash: data.accountHash,
        mintPrice: data.mintPrice,
        txHash: result.txHash,
        onChainTokenId: result.tokenId,
      });

      console.log('[Collection Pool Mint] NFT created in database:', dbResult.nft.id, 'DB tokenId:', dbResult.nft.tokenId);

      res.status(201).json({
        nft: dbResult.nft,
        tokenId: result.tokenId,
        txHash: result.txHash,
        poolMint: true,
        remainingBalance: dbResult.updatedBalance.balance,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in collection pool mint:", error);
        res.status(500).json({ error: "Failed to mint NFT from pool" });
      }
    }
  });

  // ============ PRIVACY POOL ROUTES ============

  // Get pool status and contract address
  app.get("/api/pool/status", async (_req, res) => {
    try {
      const configured = isPoolConfigured();
      
      if (!configured) {
        return res.json({ 
          available: false, 
          reason: "Privacy pool not configured" 
        });
      }

      const contractAddress = await getPoolContractAddress();
      const onChainStats = await getOnChainPoolStats();

      res.json({
        available: true,
        contractAddress,
        onChainStats,
      });
    } catch (error) {
      console.error("Error checking pool status:", error);
      res.json({ 
        available: false, 
        reason: "Failed to connect to privacy pool" 
      });
    }
  });

  // Get user's pool balance
  app.get("/api/pool/balance/:accountHash", async (req, res) => {
    try {
      const { accountHash } = req.params;
      
      // Get from database
      const dbBalance = await storage.getPoolBalance(accountHash);
      
      // Also get on-chain balance if pool is configured
      let onChainBalance = '0';
      if (isPoolConfigured()) {
        onChainBalance = await getOnChainPoolBalance(accountHash);
      }

      res.json({
        accountHash,
        balance: dbBalance?.balance || '0',
        totalDeposited: dbBalance?.totalDeposited || '0',
        totalSpent: dbBalance?.totalSpent || '0',
        onChainBalance,
        lastActivity: dbBalance?.lastActivity || null,
      });
    } catch (error) {
      console.error("Error fetching pool balance:", error);
      res.status(500).json({ error: "Failed to fetch pool balance" });
    }
  });

  // Record a deposit (called after user deposits on-chain)
  app.post("/api/pool/deposit", async (req, res) => {
    try {
      const depositSchema = z.object({
        accountHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid account hash'),
        encryptedOwner: z.string(),
        amount: z.string(),
        txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
      });

      const data = depositSchema.parse(req.body);
      
      // Update pool balance
      const poolBalance = await storage.createOrUpdatePoolBalance({
        accountHash: data.accountHash,
        encryptedOwner: data.encryptedOwner,
        amount: data.amount,
        type: 'deposit',
      });

      // Record transaction
      await storage.recordPoolTransaction({
        accountHash: data.accountHash,
        type: 'deposit',
        amount: data.amount,
        txHash: data.txHash,
      });

      res.status(201).json({
        success: true,
        balance: poolBalance.balance,
        totalDeposited: poolBalance.totalDeposited,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error recording deposit:", error);
        res.status(500).json({ error: "Failed to record deposit" });
      }
    }
  });

  // Request withdrawal from pool
  app.post("/api/pool/withdraw", async (req, res) => {
    try {
      if (!isPoolConfigured()) {
        return res.status(503).json({ 
          error: "Privacy pool not available" 
        });
      }

      const withdrawSchema = z.object({
        accountHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid account hash'),
        encryptedOwner: z.string(),
        amount: z.string(),
        recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
      });

      const data = withdrawSchema.parse(req.body);
      
      // Check balance
      const poolBalance = await storage.getPoolBalance(data.accountHash);
      if (!poolBalance || parseFloat(poolBalance.balance) < parseFloat(data.amount)) {
        return res.status(400).json({ error: "Insufficient pool balance" });
      }

      // Execute on-chain withdrawal via relayer
      const result = await withdrawFromPool(data.accountHash, data.amount, data.recipientAddress);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Withdrawal failed' });
      }

      // Update database
      const updatedBalance = await storage.createOrUpdatePoolBalance({
        accountHash: data.accountHash,
        encryptedOwner: data.encryptedOwner,
        amount: data.amount,
        type: 'withdraw',
      });

      // Record transaction
      await storage.recordPoolTransaction({
        accountHash: data.accountHash,
        type: 'withdraw',
        amount: data.amount,
        txHash: result.txHash,
      });

      res.json({
        success: true,
        txHash: result.txHash,
        balance: updatedBalance.balance,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error processing withdrawal:", error);
        res.status(500).json({ error: "Failed to process withdrawal" });
      }
    }
  });

  // Private mint using pool funds - FULLY ANONYMOUS
  app.post("/api/pool/mint", async (req, res) => {
    try {
      if (!isPoolConfigured()) {
        return res.status(503).json({ 
          error: "Privacy pool not available for minting" 
        });
      }

      const poolMintSchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        imageUrl: z.string().url(),
        mintPrice: z.string(),
        accountHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid account hash'),
        encryptedOwner: z.string(),
        encryptedHandle: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex format for encrypted handle'),
        inputProof: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex format for input proof'),
      });

      const data = poolMintSchema.parse(req.body);
      
      // Check pool balance
      const poolBalance = await storage.getPoolBalance(data.accountHash);
      if (!poolBalance || parseFloat(poolBalance.balance) < parseFloat(data.mintPrice)) {
        return res.status(400).json({ 
          error: "Insufficient pool balance. Please deposit more ETH to your privacy pool." 
        });
      }

      const uri = JSON.stringify({
        name: data.name,
        description: data.description || '',
        image: data.imageUrl,
      });

      console.log('[Pool Mint] Starting anonymous mint from pool...');
      console.log('[Pool Mint] Account hash:', data.accountHash.substring(0, 10) + '...');

      // Execute mint from pool
      const result = await privateMintFromPool({
        uri,
        mintPrice: data.mintPrice,
        encryptedOwner: data.encryptedHandle,
        inputProof: data.inputProof,
        accountHash: data.accountHash,
      });

      if (!result.success) {
        console.error('[Pool Mint] Failed:', result.error);
        return res.status(500).json({ error: result.error || 'Minting failed' });
      }

      console.log('[Pool Mint] Success! Token ID:', result.tokenId);

      // Update pool balance
      const updatedBalance = await storage.createOrUpdatePoolBalance({
        accountHash: data.accountHash,
        encryptedOwner: data.encryptedOwner,
        amount: data.mintPrice,
        type: 'mint_payment',
      });

      // Create NFT record
      const nft = await storage.createNft({
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        mintPrice: data.mintPrice,
        encryptedOwner: data.encryptedOwner,
        tokenId: result.tokenId,
      });

      // Record pool transaction
      await storage.recordPoolTransaction({
        accountHash: data.accountHash,
        type: 'mint_payment',
        amount: data.mintPrice,
        txHash: result.txHash,
        nftId: nft.id,
      });

      res.status(201).json({
        ...nft,
        txHash: result.txHash,
        poolMint: true,
        remainingBalance: updatedBalance.balance,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error in pool mint:", error);
        res.status(500).json({ error: "Failed to mint NFT from pool" });
      }
    }
  });

  // Get pool transactions for a user
  app.get("/api/pool/transactions/:accountHash", async (req, res) => {
    try {
      const { accountHash } = req.params;
      const transactions = await storage.getPoolTransactions(accountHash);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching pool transactions:", error);
      res.status(500).json({ error: "Failed to fetch pool transactions" });
    }
  });

  // Get overall pool statistics
  app.get("/api/pool/stats", async (_req, res) => {
    try {
      const dbStats = await storage.getPoolStats();
      
      let onChainStats = null;
      if (isPoolConfigured()) {
        onChainStats = await getOnChainPoolStats();
      }

      res.json({
        ...dbStats,
        onChain: onChainStats,
      });
    } catch (error) {
      console.error("Error fetching pool stats:", error);
      res.status(500).json({ error: "Failed to fetch pool stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
