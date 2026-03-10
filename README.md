# Whale Alert Bot

Real-time whale transaction monitoring for Solana with instant notifications via Telegram and Discord.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-black?style=flat&logo=solana&logoColor=14F195)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=flat&logo=telegram&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white)

## Features

- Real-time monitoring via Solana WebSocket
- Configurable thresholds per token
- Whale wallet tracking
- Exchange deposit/withdrawal detection
- Multi-channel notifications (Telegram, Discord, Webhook)
- Transaction classification (swap, transfer, stake, etc.)

## Alert Types

| Alert | Description |
|-------|-------------|
| Large Transfer | SOL/token transfers above threshold |
| Whale Swap | High-value DEX trades |
| Exchange Flow | Deposits to/from exchanges |
| Wallet Activity | Activity from tracked wallets |
| New Token | Large buys on new tokens |

## Installation

```bash
npm install
cp .env.example .env
# Configure your .env file
npm run start
```

## Configuration

```env
# RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# Thresholds
MIN_SOL_TRANSFER=1000
MIN_USDC_TRANSFER=100000
MIN_SWAP_VALUE_USD=50000

# Notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Tracked Wallets (comma-separated)
WHALE_WALLETS=wallet1,wallet2,wallet3
```

## Usage

### Start Monitoring

```typescript
import { WhaleAlertBot } from './src';

const bot = new WhaleAlertBot({
  rpcUrl: process.env.SOLANA_RPC_URL,
  wsUrl: process.env.SOLANA_WS_URL,
  thresholds: {
    sol: 1000,        // Alert on 1000+ SOL
    usdc: 100000,     // Alert on $100k+ USDC
    usdValue: 50000,  // Alert on $50k+ any token
  },
  notifications: {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    },
    discord: {
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    },
  },
});

bot.start();

// Listen to alerts
bot.on('alert', (alert) => {
  console.log(`WHALE ALERT: ${alert.summary}`);
});
```

### Track Specific Wallets

```typescript
// Add whale wallets to monitor
bot.trackWallet('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');

// Track with custom label
bot.trackWallet('HugksxcSGZnhfTuLuwnP38E94FX3HjWZfiNjiXSdx6Yh', 'Known Whale');
```

### Custom Filters

```typescript
// Only alert on specific tokens
bot.setTokenFilter(['SOL', 'USDC', 'BONK']);

// Ignore exchange wallets
bot.ignoreWallet('binance-hot-wallet-address');
```

## Alert Format

### Telegram Message

```
WHALE ALERT

Type: Large Transfer
Amount: 50,000 SOL ($8.5M)
From: 7xKX...abc (Exchange)
To: 3yHz...def (Unknown)

TX: solscan.io/tx/...
Time: 2024-01-15 14:32 UTC
```

### Discord Embed

Rich embed with:
- Transaction type and amount
- Sender/receiver with labels
- USD value
- Links to explorers
- Timestamp

## API Reference

### WhaleAlertBot

```typescript
class WhaleAlertBot extends EventEmitter {
  constructor(config: BotConfig);
  
  start(): Promise<void>;
  stop(): void;
  
  trackWallet(address: string, label?: string): void;
  untrackWallet(address: string): void;
  
  setThreshold(token: string, amount: number): void;
  setTokenFilter(tokens: string[]): void;
  ignoreWallet(address: string): void;
  
  // Events
  on('alert', (alert: WhaleAlert) => void): void;
  on('error', (error: Error) => void): void;
}
```

### WhaleAlert

```typescript
interface WhaleAlert {
  id: string;
  type: AlertType;
  signature: string;
  timestamp: number;
  
  // Transaction details
  from: WalletInfo;
  to: WalletInfo;
  token: TokenInfo;
  amount: number;
  usdValue: number;
  
  // Classification
  isExchangeFlow: boolean;
  isWhaleWallet: boolean;
  
  // Formatted
  summary: string;
  explorerUrl: string;
}

type AlertType = 
  | 'LARGE_TRANSFER'
  | 'WHALE_SWAP'
  | 'EXCHANGE_DEPOSIT'
  | 'EXCHANGE_WITHDRAWAL'
  | 'WALLET_ACTIVITY'
  | 'NEW_TOKEN_BUY';
```

## Known Exchange Wallets

The bot includes a database of known exchange wallets:
- Binance
- Coinbase
- Kraken
- FTX (historical)
- Bybit
- OKX
- And more...

## Performance

| Metric | Value |
|--------|-------|
| Latency | <500ms from on-chain |
| Throughput | 1000+ tx/sec |
| Memory | ~100MB |

## Architecture

```
src/
├── index.ts           # Main bot class
├── monitor.ts         # WebSocket monitoring
├── classifier.ts      # Transaction classification
├── notifications/
│   ├── telegram.ts    # Telegram integration
│   ├── discord.ts     # Discord webhooks
│   └── webhook.ts     # Generic webhooks
├── data/
│   ├── exchanges.ts   # Exchange wallet database
│   └── tokens.ts      # Token registry
└── types.ts           # TypeScript definitions
```

## Running in Production

### PM2

```bash
pm2 start npm --name whale-alert -- run start
pm2 save
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]
```

## Contributing

Contributions welcome! Areas of interest:
- Additional exchange wallet detection
- More notification channels
- Historical analysis

## License

MIT License - see LICENSE for details.

---

Built by [@Sugusdaddy](https://github.com/Sugusdaddy)
