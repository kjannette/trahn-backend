#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();

import * as util from "util";
import { TrahnGridTradingBot } from "./gridbot.js";
import { getChatSender } from "./chat.js";
import { sleep } from "./sleep.js";
import * as config from "./config.js";

const sendMessageToChat = getChatSender(config.WEBHOOK_URL, config.BOT_NAME);

async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ████████╗██████╗  █████╗ ██╗  ██╗███╗   ██╗                ║
║   ╚══██╔══╝██╔══██╗██╔══██╗██║  ██║████╗  ██║                ║
║      ██║   ██████╔╝███████║███████║██╔██╗ ██║                ║
║      ██║   ██╔══██╗██╔══██║██╔══██║██║╚██╗██║                ║
║      ██║   ██║  ██║██║  ██║██║  ██║██║ ╚████║                ║
║      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝                ║
║                                                              ║
║         E T H   G R I D   T R A D E R   v2.0.0               ║
║                                                              ║
║         Buy ETH Low • Sell ETH High • Repeat                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

    // Paper trading mode banner
    if (config.PAPER_TRADING_ENABLED) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   📝  P A P E R   T R A D I N G   M O D E   E N A B L E D   ║
║                                                              ║
║   • No real transactions will be broadcast                   ║
║   • Trades simulated against live market data                ║
║   • Virtual balances tracked in paper_state.json             ║
║   • Slippage and gas costs simulated                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    }

    // Validate configuration
    const validation = config.validateConfig();
    if (!validation.valid) {
        console.error("Configuration errors:");
        validation.errors.forEach((err) => console.error(`  - ${err}`));
        console.error("\nPlease check your .env file and try again.");
        process.exit(1);
    }

    config.printConfig();

    const modeLabel = config.PAPER_TRADING_ENABLED ? "📝 PAPER MODE" : "💰 LIVE MODE";
    sendMessageToChat(
        util.format(
            "🚀 Starting ETH Grid Trader (ETH/%s) - %s",
            config.QUOTE_TOKEN_SYMBOL,
            modeLabel
        ),
        "startup"
    );

    // Main loop with crash recovery
    while (true) {
        try {
            await runBot();
        } catch (err) {
            console.error("[CRASH] 💥 Bot crashed with error:", err);
            sendMessageToChat(
                util.format("[CRASH] 💥 Bot crashed: %s", err.message),
                "error"
            );
        }
        
        console.log("Restarting in 10 seconds...");
        await sleep(10 * 1000);
    }
}

async function runBot() {
    const bot = new TrahnGridTradingBot({
        // Wallet
        walletAddress: config.WALLET_ADDRESS,
        privateKey: config.PRIVATE_KEY,
        apiEndpoint: config.ETHEREUM_API_ENDPOINT,
        chainId: config.CHAIN_ID,

        // Quote Token (stablecoin for trading against ETH)
        quoteTokenAddress: config.QUOTE_TOKEN_ADDRESS,
        quoteTokenSymbol: config.QUOTE_TOKEN_SYMBOL,
        quoteTokenDecimals: config.QUOTE_TOKEN_DECIMALS,

        // Grid
        gridLevels: config.GRID_LEVELS,
        gridSpacingPercent: config.GRID_SPACING_PERCENT,
        amountPerGrid: config.AMOUNT_PER_GRID,
        basePrice: config.GRID_BASE_PRICE,

        // Trading
        slippageTolerance: config.SLIPPAGE_TOLERANCE,
        gasMultiplier: config.GAS_MULTIPLIER,
        gasLimit: config.GAS_LIMIT,
        minProfitPercent: config.MIN_PROFIT_PERCENT,

        // Timing
        priceCheckIntervalSeconds: config.PRICE_CHECK_INTERVAL_SECONDS,
        statusReportIntervalMinutes: config.STATUS_REPORT_INTERVAL_MINUTES,
        postTradeCooldownSeconds: config.POST_TRADE_COOLDOWN_SECONDS,

        // State
        stateFilePath: config.STATE_FILE_PATH,

        // Notifications
        sendMessageToChat: sendMessageToChat,
        
        // Paper Trading
        paperTrading: config.PAPER_TRADING_ENABLED,
        paperInitialETH: config.PAPER_INITIAL_ETH,
        paperInitialUSDC: config.PAPER_INITIAL_USDC,
        paperStateFilePath: config.PAPER_STATE_FILE_PATH,
        paperSlippagePercent: config.PAPER_SLIPPAGE_PERCENT,
        paperSimulateGas: config.PAPER_SIMULATE_GAS,
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
        console.log("\nReceived SIGINT, shutting down gracefully...");
        bot.shutdown();
    });

    process.on("SIGTERM", () => {
        console.log("\nReceived SIGTERM, shutting down gracefully...");
        bot.shutdown();
    });

    await bot.run();
}

// Start the bot
await main();
