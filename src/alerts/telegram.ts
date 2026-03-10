import { Telegraf, Context } from 'telegraf';

interface WhaleAlert {
  type: 'transfer' | 'swap' | 'mint' | 'burn';
  token: string;
  symbol: string;
  amount: number;
  usdValue: number;
  from: string;
  to?: string;
  txSignature: string;
  timestamp: Date;
}

export class TelegramAlertService {
  private bot: Telegraf;
  private chatIds: Set<string> = new Set();
  private minAlertValue: number = 100000; // $100k default

  constructor(token: string) {
    this.bot = new Telegraf(token);
    this.setupCommands();
  }

  private setupCommands(): void {
    this.bot.command('start', (ctx) => {
      const chatId = ctx.chat.id.toString();
      this.chatIds.add(chatId);
      ctx.reply(
        '🐋 Whale Alert Bot activated!\n\n' +
        'Commands:\n' +
        '/subscribe - Subscribe to alerts\n' +
        '/unsubscribe - Unsubscribe from alerts\n' +
        '/setmin <amount> - Set minimum USD value\n' +
        '/status - Check subscription status'
      );
    });

    this.bot.command('subscribe', (ctx) => {
      const chatId = ctx.chat.id.toString();
      this.chatIds.add(chatId);
      ctx.reply('✅ Subscribed to whale alerts!');
    });

    this.bot.command('unsubscribe', (ctx) => {
      const chatId = ctx.chat.id.toString();
      this.chatIds.delete(chatId);
      ctx.reply('❌ Unsubscribed from whale alerts');
    });

    this.bot.command('setmin', (ctx) => {
      const amount = parseInt(ctx.message.text.split(' ')[1]);
      if (isNaN(amount) || amount < 0) {
        ctx.reply('Usage: /setmin <amount>\nExample: /setmin 500000');
        return;
      }
      this.minAlertValue = amount;
      ctx.reply(`✅ Minimum alert value set to $${amount.toLocaleString()}`);
    });

    this.bot.command('status', (ctx) => {
      const chatId = ctx.chat.id.toString();
      const isSubscribed = this.chatIds.has(chatId);
      ctx.reply(
        `📊 Status:\n` +
        `Subscribed: ${isSubscribed ? '✅' : '❌'}\n` +
        `Min alert: $${this.minAlertValue.toLocaleString()}\n` +
        `Total subscribers: ${this.chatIds.size}`
      );
    });
  }

  async start(): Promise<void> {
    await this.bot.launch();
    console.log('Telegram bot started');
  }

  async sendAlert(alert: WhaleAlert): Promise<void> {
    if (alert.usdValue < this.minAlertValue) return;

    const emoji = this.getTypeEmoji(alert.type);
    const message = this.formatAlertMessage(alert, emoji);

    for (const chatId of this.chatIds) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      } catch (error) {
        console.error(`Failed to send to ${chatId}:`, error);
      }
    }
  }

  private getTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      transfer: '💸',
      swap: '🔄',
      mint: '🟢',
      burn: '🔥',
    };
    return emojis[type] || '🐋';
  }

  private formatAlertMessage(alert: WhaleAlert, emoji: string): string {
    const shortenAddr = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    
    let message = `${emoji} <b>WHALE ${alert.type.toUpperCase()}</b>\n\n`;
    message += `💰 <b>${alert.amount.toLocaleString()} ${alert.symbol}</b>\n`;
    message += `💵 $${alert.usdValue.toLocaleString()}\n\n`;
    
    if (alert.from) {
      message += `📤 From: <code>${shortenAddr(alert.from)}</code>\n`;
    }
    if (alert.to) {
      message += `📥 To: <code>${shortenAddr(alert.to)}</code>\n`;
    }
    
    message += `\n🔗 <a href="https://solscan.io/tx/${alert.txSignature}">View Transaction</a>`;
    
    return message;
  }

  stop(): void {
    this.bot.stop();
  }
}
