#!/usr/bin/env node

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

// Get the directory where this config file lives
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Application Configuration
 * 
 * SECRETS (from .env):
 * - DUNE_API_KEY
 * - WALLET_ADDRESS
 * - PRIVATE_KEY
 * 
 * CONFIGURATION CONSTANTS (defined here):
 * - Quote token settings
 * - Support/Resistance settings
 * - Risk management
 * - Paper trading settings
 */

// ============================================
// SECRETS (from .env)
// ============================================

export const DUNE_API_KEY = process.env.DUNE_API_KEY || "";
export const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
export const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

// ============================================
// BLOCKCHAIN CONFIGURATION
// ============================================

export const CHAIN_ID = 1; // 1 = Ethereum Mainnet

// Quote Token Configuration (USDC on Ethereum mainnet)
export const QUOTE_TOKEN_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const QUOTE_TOKEN_SYMBOL = "USDC";
export const QUOTE_TOKEN_DECIMALS = 6;

// WETH address (Ethereum mainnet)
export const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Uniswap V2 Router (Ethereum mainnet)
export const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// ============================================
// SUPPORT/RESISTANCE CONFIGURATION
// ============================================

export const SR_METHOD = "simple";           // "simple" or "percentile"
export const SR_REFRESH_HOURS = 48;          // How often to refresh S/R levels
export const SR_LOOKBACK_DAYS = 14;          // Lookback period for S/R calculation

// ============================================
// RISK MANAGEMENT
// ============================================

export const MAX_DAILY_TRADES = 50;          // Maximum trades per day
export const MAX_POSITION_SIZE_USD = 10000;  // Maximum position size in USD
export const STOP_LOSS_PERCENT = 0;          // Stop loss % (0 = disabled)
export const TAKE_PROFIT_PERCENT = 0;        // Take profit % (0 = disabled)

// ============================================
// PAPER TRADING CONFIGURATION
// ============================================

export const PAPER_TRADING_ENABLED = true;   // Enable paper trading mode
export const PAPER_INITIAL_ETH = 1.0;        // Starting virtual ETH balance
export const PAPER_INITIAL_USDC = 1000;      // Starting virtual USDC balance
export const PAPER_SLIPPAGE_PERCENT = 0.5;   // Simulated slippage range
export const PAPER_SIMULATE_GAS = true;      // Simulate gas costs

// State file paths (hardcoded - not configurable)
const DATA_DIR = join(__dirname, "../data");
export const STATE_FILE_PATH = join(DATA_DIR, "trahn_grid_trader.state.json");
export const PAPER_STATE_FILE_PATH = join(DATA_DIR, "trahn_grid_trader.paper_state.json");

// ============================================
// FRONTEND DATA DIRECTORY
// ============================================

export const FRONTEND_DATA_DIR = process.env.FRONTEND_DATA_DIR || 
    join(__dirname, "../../frontend/public/data");

// ============================================
// VALIDATION
// ============================================

export function validateConfig() {
    const errors = [];
    
    if (!WALLET_ADDRESS) {
        errors.push("WALLET_ADDRESS is required in .env");
    }
    
    // Private key only required for live trading
    if (!PAPER_TRADING_ENABLED && !PRIVATE_KEY) {
        errors.push("PRIVATE_KEY is required in .env for live trading");
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
    console.log("--------------------------------------");
    console.log("📊 Support/Resistance Configuration:");
    console.log(`  S/R Method: ${SR_METHOD} (high/low)`);
    console.log(`  S/R Refresh: every ${SR_REFRESH_HOURS} hours`);
    console.log(`  S/R Lookback: ${SR_LOOKBACK_DAYS} days`);
    console.log(`  Dune API: ${DUNE_API_KEY ? "✓ configured" : "✗ not set (fallback mode)"}`);
    console.log("======================================");
}
