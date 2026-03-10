import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';

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

export class DiscordAlertService {
  private client: Client;
  private channelIds: Set<string> = new Set();
  private minAlertValue: number = 100000;

  constructor(token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.setupEvents();
    this.client.login(token);
  }

  private setupEvents(): void {
    this.client.on('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'whale-subscribe') {
        this.channelIds.add(interaction.channelId);
        await interaction.reply('✅ This channel will now receive whale alerts!');
      }

      if (interaction.commandName === 'whale-unsubscribe') {
        this.channelIds.delete(interaction.channelId);
        await interaction.reply('❌ Whale alerts disabled for this channel');
      }

      if (interaction.commandName === 'whale-setmin') {
        const amount = interaction.options.getInteger('amount');
        if (amount) {
          this.minAlertValue = amount;
          await interaction.reply(`✅ Minimum alert value set to $${amount.toLocaleString()}`);
        }
      }
    });
  }

  addChannel(channelId: string): void {
    this.channelIds.add(channelId);
  }

  async sendAlert(alert: WhaleAlert): Promise<void> {
    if (alert.usdValue < this.minAlertValue) return;

    const embed = this.createAlertEmbed(alert);

    for (const channelId of this.channelIds) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (channel && channel instanceof TextChannel) {
          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error(`Failed to send to ${channelId}:`, error);
      }
    }
  }

  private createAlertEmbed(alert: WhaleAlert): EmbedBuilder {
    const colors: Record<string, number> = {
      transfer: 0x3498db,
      swap: 0x9b59b6,
      mint: 0x2ecc71,
      burn: 0xe74c3c,
    };

    const shortenAddr = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

    const embed = new EmbedBuilder()
      .setTitle(`🐋 Whale ${alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Detected`)
      .setColor(colors[alert.type] || 0x3498db)
      .addFields(
        { name: '💰 Amount', value: `${alert.amount.toLocaleString()} ${alert.symbol}`, inline: true },
        { name: '💵 Value', value: `$${alert.usdValue.toLocaleString()}`, inline: true },
        { name: '📤 From', value: `\`${shortenAddr(alert.from)}\``, inline: true },
      )
      .setTimestamp(alert.timestamp)
      .setFooter({ text: 'Whale Alert Bot' });

    if (alert.to) {
      embed.addFields({ name: '📥 To', value: `\`${shortenAddr(alert.to)}\``, inline: true });
    }

    embed.addFields({
      name: '🔗 Transaction',
      value: `[View on Solscan](https://solscan.io/tx/${alert.txSignature})`,
    });

    return embed;
  }

  destroy(): void {
    this.client.destroy();
  }
}
