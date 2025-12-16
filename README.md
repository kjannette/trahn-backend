# 📊 Trahn Grid Trader

A sophisticated grid trading bot for Uniswap V2, designed to profit from price oscillations in cryptocurrency markets.

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ████████╗██████╗  █████╗ ██╗  ██╗███╗   ██╗                ║
║   ╚══██╔══╝██╔══██╗██╔══██╗██║  ██║████╗  ██║                ║
║      ██║   ██████╔╝███████║███████║██╔██╗ ██║                ║
║      ██║   ██╔══██╗██╔══██║██╔══██║██║╚██╗██║                ║
║      ██║   ██║  ██║██║  ██║██║  ██║██║ ╚████║                ║
║      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝                ║
║                                                              ║
║              G R I D   T R A D E R   v1.0.0                  ║
╚══════════════════════════════════════════════════════════════╝
```

## 🎯 What is Grid Trading?

Grid trading is an automated trading strategy that places buy and sell orders at predetermined price intervals (a "grid"). The bot profits from price oscillations within the grid range:

- **When price drops**: Buy orders are triggered at lower grid levels
- **When price rises**: Sell orders are triggered at higher grid levels
- **Profit**: Made from the spread between buy and sell prices

```
Price
  │
  │  ────────  SELL Level 5  ($0.035)
  │  ────────  SELL Level 4  ($0.034)
  │  ────────  SELL Level 3  ($0.033)
  │  ════════  CENTER PRICE  ($0.032)  ← Grid initialized here
  │  ────────  BUY Level 2   ($0.031)
  │  ────────  BUY Level 1   ($0.030)
  │  ────────  BUY Level 0   ($0.029)
  │
  └─────────────────────────────────────►
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd trahn_grid_trader
npm install
# or
yarn install
```

### 2. Configure Environment

```bash
cp env.example .env
# Edit .env with your settings
```

### 3. Run the Bot

```bash
npm start
# or
node main.js
```

## ⚙️ Configuration

### Essential Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `ETHEREUM_API_ENDPOINT` | RPC endpoint (Infura/Alchemy) | `https://mainnet.infura.io/v3/xxx` |
| `WALLET_ADDRESS` | Your wallet address | `0x1337...` |
| `PRIVATE_KEY` | Wallet private key (with 0x) | `0xabcd...` |
| `BASE_TOKEN_ADDRESS` | Token to trade | `0x66d2...` |

### Grid Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `GRID_LEVELS` | Total number of grid levels | `10` |
| `GRID_SPACING_PERCENT` | % between each level | `2` |
| `GRID_BASE_PRICE` | Center price (0 = auto) | `0` |
| `AMOUNT_PER_GRID` | USD per grid order | `100` |

### Trading Parameters

| Variable | Description | Default |
|----------|-------------|---------|
| `SLIPPAGE_TOLERANCE` | Max slippage % | `1.5` |
| `GAS_MULTIPLIER` | Gas price multiplier | `1.2` |
| `GAS_LIMIT` | Max gas per tx | `250000` |

## 📱 Notifications

The bot supports Slack and Discord webhooks for real-time notifications:

```env
WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
BOT_NAME=TrahnGridTrader
```

### Notification Types
- 🚀 **Startup** - Bot initialization
- 📊 **Grid** - Grid setup/changes
- 🟢 **Buy** - Buy order executed
- 🔴 **Sell** - Sell order executed
- ℹ️ **Status** - Periodic status updates
- ⚠️ **Warning** - Non-critical issues
- ❌ **Error** - Critical errors

## 🔒 Security Best Practices

1. **Never commit your `.env` file** - It's in `.gitignore`
2. **Use a dedicated trading wallet** - Don't use your main wallet
3. **Start with small amounts** - Test the strategy first
4. **Use a hardware wallet** for large amounts
5. **Monitor your bot** regularly

## 📊 State Management

The bot persists its state to a JSON file, allowing it to:
- Resume after restarts
- Track filled grid levels
- Maintain trade history

Default state file: `~/trahn_grid_trader.state.json`

## 🏗️ Architecture

```
trahn_grid_trader/
├── main.js          # Entry point
├── gridbot.js       # Core trading logic
├── config.js        # Configuration management
├── chat.js          # Notification system
├── sleep.js         # Timing utilities
├── package.json     # Dependencies
├── env.example      # Example configuration
└── README.md        # This file
```

## 🔧 Development

```bash
# Watch mode (auto-restart on changes)
npm run dev

# Format code
npm run format

# Run tests
npm test
```

## ⚠️ Disclaimer

**USE AT YOUR OWN RISK**

This software is provided "as is" without warranty of any kind. Trading cryptocurrencies carries significant risk. You could lose some or all of your investment. This bot is for educational purposes and should be thoroughly tested before use with real funds.

- Always test on testnets first
- Start with small amounts
- Never invest more than you can afford to lose
- Past performance does not guarantee future results

## 📝 License

MIT License - See [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ☕ and 🎵 by the Trahn Grid Trader team

