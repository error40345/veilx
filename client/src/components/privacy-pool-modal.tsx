import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/lib/wallet';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Shield, ArrowDownToLine, ArrowUpFromLine, Wallet, Lock, Info } from 'lucide-react';
import { ethers } from 'ethers';

interface PrivacyPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PoolBalance {
  accountHash: string;
  balance: string;
  totalDeposited: string;
  totalSpent: string;
  onChainBalance: string;
  lastActivity: string | null;
}

interface PoolStatus {
  available: boolean;
  contractAddress?: string;
  reason?: string;
}

const PRIVACY_POOL_ABI = [
  "function deposit(bytes32 accountHash) payable",
];

export function PrivacyPoolModal({ isOpen, onClose }: PrivacyPoolModalProps) {
  const { address, isConnected, provider, signer } = useWallet();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState('0.01');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [accountHash, setAccountHash] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
      setAccountHash(hash);
    }
  }, [address]);

  const { data: poolStatus } = useQuery<PoolStatus>({
    queryKey: ['/api/pool/status'],
    enabled: isOpen,
  });

  const { data: poolBalance, refetch: refetchBalance } = useQuery<PoolBalance>({
    queryKey: ['/api/pool/balance', accountHash],
    enabled: isOpen && !!accountHash,
  });

  const recordDepositMutation = useMutation({
    mutationFn: async (data: { accountHash: string; encryptedOwner: string; amount: string; txHash: string }) => {
      const response = await apiRequest('POST', '/api/pool/deposit', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pool/balance'] });
      toast({
        title: 'Deposit recorded',
        description: 'Your pool balance has been updated.',
      });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { accountHash: string; encryptedOwner: string; amount: string; recipientAddress: string }) => {
      const response = await apiRequest('POST', '/api/pool/withdraw', data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pool/balance'] });
      toast({
        title: 'Withdrawal successful',
        description: `Withdrew ${withdrawAmount} ETH. TX: ${data.txHash?.substring(0, 10)}...`,
      });
      setWithdrawAmount('');
    },
    onError: (error: any) => {
      toast({
        title: 'Withdrawal failed',
        description: error.message || 'Failed to withdraw from pool',
        variant: 'destructive',
      });
    },
  });

  const handleDeposit = async () => {
    if (!signer || !address || !accountHash || !poolStatus?.contractAddress) {
      toast({
        title: 'Cannot deposit',
        description: 'Please connect your wallet and ensure the pool is available.',
        variant: 'destructive',
      });
      return;
    }

    setIsDepositing(true);
    try {
      const amountWei = ethers.parseEther(depositAmount);
      
      const poolContract = new ethers.Contract(
        poolStatus.contractAddress,
        PRIVACY_POOL_ABI,
        signer
      );

      toast({
        title: 'Depositing to Privacy Pool',
        description: 'Please confirm the transaction in your wallet...',
      });

      const tx = await poolContract.deposit(accountHash, { value: amountWei });
      
      toast({
        title: 'Transaction submitted',
        description: 'Waiting for confirmation...',
      });

      const receipt = await tx.wait();

      await recordDepositMutation.mutateAsync({
        accountHash,
        encryptedOwner: address,
        amount: depositAmount,
        txHash: receipt.hash,
      });

      toast({
        title: 'Deposit successful',
        description: `Deposited ${depositAmount} ETH to your privacy pool.`,
      });
      
      setDepositAmount('0.01');
      refetchBalance();
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast({
        title: 'Deposit failed',
        description: error.reason || error.message || 'Failed to deposit to pool',
        variant: 'destructive',
      });
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!address || !accountHash) {
      toast({
        title: 'Cannot withdraw',
        description: 'Please connect your wallet.',
        variant: 'destructive',
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      await withdrawMutation.mutateAsync({
        accountHash,
        encryptedOwner: address,
        amount: withdrawAmount,
        recipientAddress: address,
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const balance = parseFloat(poolBalance?.balance || '0');
  const totalDeposited = parseFloat(poolBalance?.totalDeposited || '0');
  const totalSpent = parseFloat(poolBalance?.totalSpent || '0');

  if (!isConnected) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy Pool
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Connect your wallet to use the Privacy Pool</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl">
            <Shield className="h-6 w-6 text-primary" />
            Privacy Pool
          </DialogTitle>
          <DialogDescription>
            Deposit ETH to mint NFTs anonymously. Your deposits are mixed with others, breaking the link between your wallet and minting activity.
          </DialogDescription>
        </DialogHeader>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pool Balance</p>
                <p className="text-3xl font-bold">{balance.toFixed(4)} ETH</p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" />
                Private
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-primary/10">
              <div>
                <p className="text-xs text-muted-foreground">Total Deposited</p>
                <p className="font-semibold">{totalDeposited.toFixed(4)} ETH</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Spent on Mints</p>
                <p className="font-semibold">{totalSpent.toFixed(4)} ETH</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="bg-muted/50 rounded-lg p-3 flex gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            When you mint using pool funds, the relayer pays on your behalf. 
            On Etherscan, only the relayer address appears - not your wallet.
          </p>
        </div>

        <Tabs defaultValue="deposit" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposit" className="gap-2" data-testid="tab-deposit">
              <ArrowDownToLine className="h-4 w-4" />
              Deposit
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-2" data-testid="tab-withdraw">
              <ArrowUpFromLine className="h-4 w-4" />
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (ETH)</Label>
              <Input
                id="deposit-amount"
                type="number"
                step="0.001"
                min="0.001"
                max="10"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.01"
                data-testid="input-deposit-amount"
              />
              <p className="text-xs text-muted-foreground">
                Min: 0.001 ETH | Max: 10 ETH per deposit
              </p>
            </div>

            <Button
              onClick={handleDeposit}
              disabled={isDepositing || !poolStatus?.available}
              className="w-full"
              data-testid="button-deposit"
            >
              {isDepositing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Depositing...
                </>
              ) : (
                <>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Deposit {depositAmount} ETH
                </>
              )}
            </Button>

            {!poolStatus?.available && (
              <p className="text-xs text-destructive text-center">
                Privacy Pool is not available: {poolStatus?.reason}
              </p>
            )}
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="withdraw-amount">Amount (ETH)</Label>
                <button
                  onClick={() => setWithdrawAmount(balance.toString())}
                  className="text-xs text-primary hover:underline"
                  data-testid="button-withdraw-max"
                >
                  Max: {balance.toFixed(4)} ETH
                </button>
              </div>
              <Input
                id="withdraw-amount"
                type="number"
                step="0.001"
                min="0.001"
                max={balance}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                data-testid="input-withdraw-amount"
              />
            </div>

            <Button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) > balance || parseFloat(withdrawAmount) <= 0}
              variant="outline"
              className="w-full"
              data-testid="button-withdraw"
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  Withdraw to Wallet
                </>
              )}
            </Button>

            {parseFloat(withdrawAmount) > balance && (
              <p className="text-xs text-destructive text-center">
                Insufficient pool balance
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
