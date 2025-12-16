#!/usr/bin/env node

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

// Get the directory where this config file lives (backend/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ETH Grid Trading Bot Configuration
 * All configuration is loaded from environment variables with sensible defaults
 */

// Network Configuration
export const ETHEREUM_API_ENDPOINT = process.env.ETHEREUM_API_ENDPOINT || "";
export const CHAIN_ID = parseInt(process.env.CHAIN_ID || "1"); // 1 = mainnet

// Wallet Configuration
export const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
export const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// Quote Token Configuration (Stablecoin - used to buy/sell ETH)
export const QUOTE_TOKEN_ADDRESS = process.env.QUOTE_TOKEN_ADDRESS || 
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC mainnet
export const QUOTE_TOKEN_SYMBOL = process.env.QUOTE_TOKEN_SYMBOL || "USDC";
export const QUOTE_TOKEN_DECIMALS = parseInt(process.env.QUOTE_TOKEN_DECIMALS || "6");

// WETH address (mainnet default)
export const WETH_ADDRESS = process.env.WETH_ADDRESS || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Uniswap V2 Router
export const UNISWAP_ROUTER_ADDRESS = process.env.UNISWAP_ROUTER_ADDRESS || "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// Grid Configuration
export const GRID_LEVELS = parseInt(process.env.GRID_LEVELS || "10"); // Number of grid levels
export const GRID_SPACING_PERCENT = parseFloat(process.env.GRID_SPACING_PERCENT || "2"); // % between each grid level
export const GRID_BASE_PRICE = parseFloat(process.env.GRID_BASE_PRICE || "0"); // Center price (0 = auto-detect)
export const AMOUNT_PER_GRID = parseFloat(process.env.AMOUNT_PER_GRID || "100"); // USD per grid order

// Trading Parameters
export const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || "1.5"); // %
export const GAS_MULTIPLIER = parseFloat(process.env.GAS_MULTIPLIER || "1.2");
export const GAS_LIMIT = parseInt(process.env.GAS_LIMIT || "250000");
export const MIN_PROFIT_PERCENT = parseFloat(process.env.MIN_PROFIT_PERCENT || "0.5"); // Minimum profit % to execute

// Timing Configuration
export const PRICE_CHECK_INTERVAL_SECONDS = parseInt(process.env.PRICE_CHECK_INTERVAL_SECONDS || "30");
export const STATUS_REPORT_INTERVAL_MINUTES = parseInt(process.env.STATUS_REPORT_INTERVAL_MINUTES || "60");
export const POST_TRADE_COOLDOWN_SECONDS = parseInt(process.env.POST_TRADE_COOLDOWN_SECONDS || "60");
export const COINGECKO_QUERY_INTERVAL_MS = parseInt(process.env.COINGECKO_QUERY_INTERVAL_MS || "120000");

// Notifications
export const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
export const BOT_NAME = process.env.BOT_NAME || "TrahnGridTrader";

// State Management - stored in backend directory
export const STATE_FILE_PATH = process.env.STATE_FILE_PATH || 
    join(__dirname, "trahn_grid_trader.state.json");

// Risk Management
export const MAX_DAILY_TRADES = parseInt(process.env.MAX_DAILY_TRADES || "50");
export const MAX_POSITION_SIZE_USD = parseFloat(process.env.MAX_POSITION_SIZE_USD || "10000");
export const STOP_LOSS_PERCENT = parseFloat(process.env.STOP_LOSS_PERCENT || "0"); // 0 = disabled
export const TAKE_PROFIT_PERCENT = parseFloat(process.env.TAKE_PROFIT_PERCENT || "0"); // 0 = disabled

// Etherscan
export const EXPLORER_TX_PREFIX = process.env.EXPLORER_TX_PREFIX || "https://etherscan.io/tx/";

// Paper Trading Configuration
export const PAPER_TRADING_ENABLED = process.env.PAPER_TRADING_ENABLED === "true";
export const PAPER_INITIAL_ETH = parseFloat(process.env.PAPER_INITIAL_ETH || "1.0");
export const PAPER_INITIAL_USDC = parseFloat(process.env.PAPER_INITIAL_USDC || "1000");
export const PAPER_STATE_FILE_PATH = process.env.PAPER_STATE_FILE_PATH || 
    join(__dirname, "trahn_grid_trader.paper_state.json");
export const PAPER_SLIPPAGE_PERCENT = parseFloat(process.env.PAPER_SLIPPAGE_PERCENT || "0.5");
export const PAPER_SIMULATE_GAS = process.env.PAPER_SIMULATE_GAS !== "false"; // default true

// Dune Analytics Configuration
export const DUNE_API_KEY = process.env.DUNE_API_KEY || "";
// Support/Resistance Method: "simple" (high/low) or "percentile" (5th/95th)
export const SR_METHOD = process.env.SR_METHOD || "simple";
// S/R Refresh interval in hours (default 48 hours)
export const SR_REFRESH_HOURS = parseFloat(process.env.SR_REFRESH_HOURS || "48");
// S/R Lookback period in days (default 14 days)
export const SR_LOOKBACK_DAYS = parseInt(process.env.SR_LOOKBACK_DAYS || "14");

/**
 * Parse command line arguments
 * Supported: --sr-method=simple|percentile --sr-refresh=<hours>
 */
export function parseCliArgs() {
    const args = process.argv.slice(2);
    const overrides = {};
    
    for (const arg of args) {
        if (arg.startsWith("--sr-method=")) {
            const method = arg.split("=")[1];
            if (method === "simple" || method === "percentile") {
                overrides.srMethod = method;
            } else {
                console.warn(`Invalid --sr-method value: ${method}. Using default.`);
            }
        } else if (arg.startsWith("--sr-refresh=")) {
            const hours = parseFloat(arg.split("=")[1]);
            if (!isNaN(hours) && hours > 0) {
                overrides.srRefreshHours = hours;
            } else {
                console.warn(`Invalid --sr-refresh value: ${arg.split("=")[1]}. Using default.`);
            }
        } else if (arg.startsWith("--sr-lookback=")) {
            const days = parseInt(arg.split("=")[1]);
            if (!isNaN(days) && days > 0) {
                overrides.srLookbackDays = days;
            } else {
                console.warn(`Invalid --sr-lookback value: ${arg.split("=")[1]}. Using default.`);
            }
        }
    }
    
    return overrides;
}

// Parse CLI args and apply overrides
const cliOverrides = parseCliArgs();
export const EFFECTIVE_SR_METHOD = cliOverrides.srMethod || SR_METHOD;
export const EFFECTIVE_SR_REFRESH_HOURS = cliOverrides.srRefreshHours || SR_REFRESH_HOURS;
export const EFFECTIVE_SR_LOOKBACK_DAYS = cliOverrides.srLookbackDays || SR_LOOKBACK_DAYS;

/**
 * Validate required configuration
 */
export function validateConfig() {
    const errors = [];
    
    if (!ETHEREUM_API_ENDPOINT) {
        errors.push("ETHEREUM_API_ENDPOINT is required");
    }
    if (!WALLET_ADDRESS) {
        errors.push("WALLET_ADDRESS is required");
    }
    // Private key only required for live trading
    if (!PAPER_TRADING_ENABLED && !PRIVATE_KEY) {
        errors.push("PRIVATE_KEY is required for live trading");
    }
    
    if (GRID_LEVELS < 2) {
        errors.push("GRID_LEVELS must be at least 2");
    }
    if (GRID_SPACING_PERCENT <= 0) {
        errors.push("GRID_SPACING_PERCENT must be greater than 0");
    }
    if (AMOUNT_PER_GRID <= 0) {
        errors.push("AMOUNT_PER_GRID must be greater than 0");
    }
    
    // Paper trading validation
    if (PAPER_TRADING_ENABLED) {
        if (PAPER_INITIAL_ETH <= 0 && PAPER_INITIAL_USDC <= 0) {
            errors.push("Paper trading requires at least some initial ETH or USDC");
        }
    }
    
    // Dune API validation (warn only, not required)
    if (!DUNE_API_KEY) {
        console.warn("⚠️  DUNE_API_KEY not set - will use current price for grid center (fallback mode)");
    }
    
    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Print current configuration (sanitized)
 */
export function printConfig() {
    console.log("=== ETH Grid Trading Bot Configuration ===");
    
    if (PAPER_TRADING_ENABLED) {
        console.log("════════════════════════════════════════");
        console.log("  📝 PAPER TRADING MODE ENABLED");
        console.log("  📝 No real transactions will execute");
        console.log("════════════════════════════════════════");
        console.log(`Paper Initial ETH: ${PAPER_INITIAL_ETH}`);
        console.log(`Paper Initial ${QUOTE_TOKEN_SYMBOL}: ${PAPER_INITIAL_USDC}`);
        console.log(`Paper Slippage: 0-${PAPER_SLIPPAGE_PERCENT}%`);
        console.log(`Paper Gas Simulation: ${PAPER_SIMULATE_GAS ? "enabled" : "disabled"}`);
    } else {
        console.log("  💰 LIVE TRADING MODE");
    }
    
    console.log("--------------------------------------");
    console.log(`Chain ID: ${CHAIN_ID}`);
    console.log(`Wallet: ${WALLET_ADDRESS.slice(0, 10)}...${WALLET_ADDRESS.slice(-6)}`);
    console.log(`Trading Pair: ETH/${QUOTE_TOKEN_SYMBOL}`);
    console.log(`Quote Token: ${QUOTE_TOKEN_SYMBOL} (${QUOTE_TOKEN_ADDRESS.slice(0, 10)}...)`);
    console.log(`Grid Levels: ${GRID_LEVELS}`);
    console.log(`Grid Spacing: ${GRID_SPACING_PERCENT}%`);
    console.log(`Amount per Grid: $${AMOUNT_PER_GRID}`);
    console.log(`Slippage Tolerance: ${SLIPPAGE_TOLERANCE}%`);
    console.log(`Price Check Interval: ${PRICE_CHECK_INTERVAL_SECONDS}s`);
    console.log("--------------------------------------");
    console.log("📊 Support/Resistance Configuration:");
    console.log(`  S/R Method: ${EFFECTIVE_SR_METHOD} (high/low)`);
    console.log(`  S/R Refresh: every ${EFFECTIVE_SR_REFRESH_HOURS} hours`);
    console.log(`  S/R Lookback: ${EFFECTIVE_SR_LOOKBACK_DAYS} days`);
    console.log(`  Dune API: ${DUNE_API_KEY ? "✓ configured" : "✗ not set (fallback mode)"}`);
    console.log("======================================");
}
