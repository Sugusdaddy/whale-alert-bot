import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { EventEmitter } from 'eventemitter3';
import axios from 'axios';

// Types
export type AlertType = 
  | 'LARGE_TRANSFER'
  | 'WHALE_SWAP'
  | 'EXCHANGE_DEPOSIT'
  | 'EXCHANGE_WITHDRAWAL'
  | 'WALLET_ACTIVITY'
  | 'NEW_TOKEN_BUY';

export interface WalletInfo {
  address: string;
  label?: string;
  isExchange: boolean;
  isWhale: boolean;
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  decimals: number;
}

export interface WhaleAlert {
  id: string;
  type: AlertType;
  signature: string;
  timestamp: number;
  from: WalletInfo;
  to: WalletInfo;
  token: TokenInfo;
  amount: number;
  usdValue: number;
  isExchangeFlow: boolean;
  isWhaleWallet: boolean;
  summary: string;
  explorerUrl: string;
}

export interface BotConfig {
  rpcUrl: string;
  wsUrl?: string;
  thresholds: {
    sol?: number;
    usdc?: number;
    usdValue?: number;
  };
  notifications?: {
    telegram?: {
      botToken: string;
      chatId: string;
    };
    discord?: {
      webhookUrl: string;
    };
  };
}

// Known exchange wallets
const EXCHANGE_WALLETS: Record<string, string> = {
  // Binance
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': 'Binance',
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': 'Binance',
  // Coinbase
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS': 'Coinbase',
  'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE': 'Coinbase Prime',
  // Kraken
  'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq': 'Kraken',
  // OKX
  '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD': 'OKX',
};

// Token registry
const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  'So11111111111111111111111111111111111111112': {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    decimals: 6,
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    decimals: 6,
  },
};

export class WhaleAlertBot extends EventEmitter {
  private connection: Connection;
  private config: BotConfig;
  private trackedWallets: Map<string, string> = new Map();
  private ignoredWallets: Set<string> = new Set();
  private subscriptionId: number | null = null;
  private solPrice: number = 0;

  constructor(config: BotConfig) {
    super();
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      wsEndpoint: config.wsUrl,
      commitment: 'confirmed',
    });
  }

  async start(): Promise<void> {
    console.log('Starting Whale Alert Bot...');

    // Fetch SOL price
    await this.updateSolPrice();
    setInterval(() => this.updateSolPrice(), 60000); // Update every minute

    // Subscribe to logs
    this.subscriptionId = this.connection.onLogs(
      'all',
      async (logs, context) => {
        try {
          await this.processTransaction(logs.signature);
        } catch (error) {
          // Silently handle errors for non-whale transactions
        }
      },
      'confirmed'
    );

    console.log('Whale Alert Bot started');
    this.emit('started');
  }

  stop(): void {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
    console.log('Whale Alert Bot stopped');
    this.emit('stopped');
  }

  trackWallet(address: string, label?: string): void {
    this.trackedWallets.set(address, label || 'Tracked Wallet');
    console.log(`Tracking wallet: ${address} (${label || 'Tracked Wallet'})`);
  }

  untrackWallet(address: string): void {
    this.trackedWallets.delete(address);
  }

  ignoreWallet(address: string): void {
    this.ignoredWallets.add(address);
  }

  setThreshold(token: string, amount: number): void {
    if (token === 'sol') {
      this.config.thresholds.sol = amount;
    } else if (token === 'usdc') {
      this.config.thresholds.usdc = amount;
    }
  }

  private async updateSolPrice(): Promise<void> {
    try {
      const response = await axios.get(
        'https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112'
      );
      this.solPrice = response.data.data['So11111111111111111111111111111111111111112']?.price || 0;
    } catch {
      console.warn('Failed to fetch SOL price');
    }
  }

  private async processTransaction(signature: string): Promise<void> {
    const tx = await this.connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) return;

    // Check for large SOL transfer
    const preBalances = tx.meta.preBalances;
    const postBalances = tx.meta.postBalances;
    const accounts = tx.transaction.message.staticAccountKeys.map(k => k.toBase58());

    for (let i = 0; i < preBalances.length; i++) {
      const diff = (preBalances[i] - postBalances[i]) / LAMPORTS_PER_SOL;
      
      // Large outflow (transfer out)
      if (diff > (this.config.thresholds.sol || 1000)) {
        const from = accounts[i];
        const to = this.findRecipient(accounts, preBalances, postBalances, i);
        
        if (this.ignoredWallets.has(from) || this.ignoredWallets.has(to)) continue;

        const alert = this.createAlert({
          signature,
          from,
          to,
          amount: Math.abs(diff),
          token: TOKEN_REGISTRY['So11111111111111111111111111111111111111112'],
          timestamp: tx.blockTime || Date.now() / 1000,
        });

        this.emit('alert', alert);
        await this.sendNotifications(alert);
      }
    }
  }

  private findRecipient(
    accounts: string[],
    preBalances: number[],
    postBalances: number[],
    senderIndex: number
  ): string {
    // Find account with largest positive balance change
    let maxInflow = 0;
    let recipientIndex = 0;

    for (let i = 0; i < preBalances.length; i++) {
      if (i === senderIndex) continue;
      const inflow = postBalances[i] - preBalances[i];
      if (inflow > maxInflow) {
        maxInflow = inflow;
        recipientIndex = i;
      }
    }

    return accounts[recipientIndex] || 'Unknown';
  }

  private createAlert(params: {
    signature: string;
    from: string;
    to: string;
    amount: number;
    token: TokenInfo;
    timestamp: number;
  }): WhaleAlert {
    const { signature, from, to, amount, token, timestamp } = params;

    const fromInfo = this.getWalletInfo(from);
    const toInfo = this.getWalletInfo(to);
    const usdValue = token.symbol === 'SOL' ? amount * this.solPrice : amount;

    let type: AlertType = 'LARGE_TRANSFER';
    if (fromInfo.isExchange && !toInfo.isExchange) {
      type = 'EXCHANGE_WITHDRAWAL';
    } else if (!fromInfo.isExchange && toInfo.isExchange) {
      type = 'EXCHANGE_DEPOSIT';
    } else if (fromInfo.isWhale || toInfo.isWhale) {
      type = 'WALLET_ACTIVITY';
    }

    const summary = `${this.formatAmount(amount)} ${token.symbol} ($${this.formatAmount(usdValue)}) moved from ${fromInfo.label || this.shortenAddress(from)} to ${toInfo.label || this.shortenAddress(to)}`;

    return {
      id: `${signature}-${Date.now()}`,
      type,
      signature,
      timestamp,
      from: fromInfo,
      to: toInfo,
      token,
      amount,
      usdValue,
      isExchangeFlow: fromInfo.isExchange || toInfo.isExchange,
      isWhaleWallet: fromInfo.isWhale || toInfo.isWhale,
      summary,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  }

  private getWalletInfo(address: string): WalletInfo {
    const exchangeLabel = EXCHANGE_WALLETS[address];
    const trackedLabel = this.trackedWallets.get(address);

    return {
      address,
      label: exchangeLabel || trackedLabel,
      isExchange: !!exchangeLabel,
      isWhale: !!trackedLabel,
    };
  }

  private async sendNotifications(alert: WhaleAlert): Promise<void> {
    const { notifications } = this.config;
    if (!notifications) return;

    // Telegram
    if (notifications.telegram) {
      await this.sendTelegram(alert, notifications.telegram);
    }

    // Discord
    if (notifications.discord) {
      await this.sendDiscord(alert, notifications.discord);
    }
  }

  private async sendTelegram(
    alert: WhaleAlert,
    config: { botToken: string; chatId: string }
  ): Promise<void> {
    const message = `
<b>WHALE ALERT</b>

<b>Type:</b> ${alert.type.replace(/_/g, ' ')}
<b>Amount:</b> ${this.formatAmount(alert.amount)} ${alert.token.symbol}
<b>USD Value:</b> $${this.formatAmount(alert.usdValue)}
<b>From:</b> ${alert.from.label || this.shortenAddress(alert.from.address)}
<b>To:</b> ${alert.to.label || this.shortenAddress(alert.to.address)}

<a href="${alert.explorerUrl}">View Transaction</a>
    `.trim();

    try {
      await axios.post(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          chat_id: config.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }
      );
    } catch (error) {
      console.error('Telegram notification failed:', error);
    }
  }

  private async sendDiscord(
    alert: WhaleAlert,
    config: { webhookUrl: string }
  ): Promise<void> {
    const embed = {
      title: 'WHALE ALERT',
      color: alert.type === 'EXCHANGE_DEPOSIT' ? 0xff6b6b : 0x51cf66,
      fields: [
        { name: 'Type', value: alert.type.replace(/_/g, ' '), inline: true },
        { name: 'Amount', value: `${this.formatAmount(alert.amount)} ${alert.token.symbol}`, inline: true },
        { name: 'USD Value', value: `$${this.formatAmount(alert.usdValue)}`, inline: true },
        { name: 'From', value: alert.from.label || this.shortenAddress(alert.from.address), inline: true },
        { name: 'To', value: alert.to.label || this.shortenAddress(alert.to.address), inline: true },
      ],
      url: alert.explorerUrl,
      timestamp: new Date(alert.timestamp * 1000).toISOString(),
    };

    try {
      await axios.post(config.webhookUrl, { embeds: [embed] });
    } catch (error) {
      console.error('Discord notification failed:', error);
    }
  }

  private formatAmount(amount: number): string {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`;
    return amount.toFixed(2);
  }

  private shortenAddress(address: string): string {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
}

export default WhaleAlertBot;

// Main entry point
if (require.main === module) {
  const bot = new WhaleAlertBot({
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    wsUrl: process.env.SOLANA_WS_URL,
    thresholds: {
      sol: parseInt(process.env.MIN_SOL_TRANSFER || '1000'),
      usdc: parseInt(process.env.MIN_USDC_TRANSFER || '100000'),
      usdValue: parseInt(process.env.MIN_SWAP_VALUE_USD || '50000'),
    },
    notifications: {
      telegram: process.env.TELEGRAM_BOT_TOKEN ? {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID || '',
      } : undefined,
      discord: process.env.DISCORD_WEBHOOK_URL ? {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      } : undefined,
    },
  });

  bot.on('alert', (alert) => {
    console.log(`[ALERT] ${alert.summary}`);
  });

  bot.start();
}
