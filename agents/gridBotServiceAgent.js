#!/usr/bin/env node

/**
 * Grid Bot Service Agent
 * 
 * Manages the grid trading bot lifecycle
 * Called by app.js to start/stop the bot
 */

import * as util from "util";
import { TrahnGridTradingBot } from "./gridbot.js";
import { getChatSender } from "../services/notifications/chat.js";
import * as config from "../configuration/config.js";
import * as gridConfig from "../services/analytics/gridAnalytics.js";

const ETHEREUM_API_ENDPOINT = process.env.ETHEREUM_API_ENDPOINT || "";
const sendMessageToChat = getChatSender();

// Global bot instance
let bot = null;
let isRunning = false;

/**
 * Start the grid trading bot
 */
export async function startGridBot() {
    if (isRunning) {
        console.log("⚠️  [BOT] Already running");
        return;
    }

    console.log("\n📊 Grid Analytics Configuration:");
    console.log(`  Grid Levels: ${gridConfig.GRID_LEVELS}`);
    console.log(`  Grid Spacing: ${gridConfig.GRID_SPACING_PERCENT}%`);
    console.log(`  Amount per Grid: $${gridConfig.AMOUNT_PER_GRID}`);
    console.log(`  Slippage Tolerance: ${gridConfig.SLIPPAGE_TOLERANCE}%`);
    console.log(`  Price Check Interval: ${gridConfig.PRICE_CHECK_INTERVAL_SECONDS}s`);
    console.log("======================================\n");

    const modeLabel = config.PAPER_TRADING_ENABLED ? "📝 PAPER MODE" : "💰 LIVE MODE";
    sendMessageToChat(
        util.format(
            "🚀 Starting ETH Grid Trader (ETH/%s) - %s",
            config.QUOTE_TOKEN_SYMBOL,
            modeLabel
        ),
        "startup"
    );

    bot = new TrahnGridTradingBot({
        // Wallet
        walletAddress: config.WALLET_ADDRESS,
        privateKey: config.PRIVATE_KEY,
        apiEndpoint: ETHEREUM_API_ENDPOINT,
        chainId: config.CHAIN_ID,

        // Quote Token
        quoteTokenAddress: config.QUOTE_TOKEN_ADDRESS,
        quoteTokenSymbol: config.QUOTE_TOKEN_SYMBOL,
        quoteTokenDecimals: config.QUOTE_TOKEN_DECIMALS,

        // Grid
        gridLevels: gridConfig.GRID_LEVELS,
        gridSpacingPercent: gridConfig.GRID_SPACING_PERCENT,
        amountPerGrid: gridConfig.AMOUNT_PER_GRID,
        basePrice: gridConfig.GRID_BASE_PRICE,

        // Trading
        slippageTolerance: gridConfig.SLIPPAGE_TOLERANCE,
        gasMultiplier: gridConfig.GAS_MULTIPLIER,
        gasLimit: gridConfig.GAS_LIMIT,
        minProfitPercent: gridConfig.MIN_PROFIT_PERCENT,

        // Timing
        priceCheckIntervalSeconds: gridConfig.PRICE_CHECK_INTERVAL_SECONDS,
        statusReportIntervalMinutes: gridConfig.STATUS_REPORT_INTERVAL_MINUTES,
        postTradeCooldownSeconds: gridConfig.POST_TRADE_COOLDOWN_SECONDS,

        // Notifications
        sendMessageToChat: sendMessageToChat,
        
        // Paper Trading
        paperTrading: config.PAPER_TRADING_ENABLED,
        paperInitialETH: config.PAPER_INITIAL_ETH,
        paperInitialUSDC: config.PAPER_INITIAL_USDC,
        paperSlippagePercent: config.PAPER_SLIPPAGE_PERCENT,
        paperSimulateGas: config.PAPER_SIMULATE_GAS,
        
        // Dune Analytics / Support-Resistance
        duneApiKey: config.DUNE_API_KEY,
        srMethod: config.SR_METHOD,
        srRefreshHours: config.SR_REFRESH_HOURS,
        srLookbackDays: config.SR_LOOKBACK_DAYS,
    });

    console.log("🤖 [BOT] Grid trading bot initialized");
    
    // Initialize async state (load from database)
    await bot.init();
    console.log("🤖 [BOT] State loaded from database");
    
    // Start bot in background (non-blocking)
    isRunning = true;
    bot.run().catch((err) => {
        console.error("🤖 [BOT] Crashed:", err.message);
        isRunning = false;
    });

    console.log("🤖 [BOT] Started successfully");
}

/**
 * Stop the grid trading bot
 */
export async function stopGridBot() {
    if (bot) {
        bot.shutdown();
        bot = null;
    }
    isRunning = false;
    console.log("🤖 [BOT] Stopped");
}

/**
 * Get the bot instance (for scheduler callbacks)
 */
export function getGridBotInstance() {
    return bot;
}

/**
 * Check if bot is running
 */
export function isBotRunning() {
    return isRunning;
}
