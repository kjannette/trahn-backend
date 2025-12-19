#!/usr/bin/env node

/**
 * Grid Analytics Configuration
 * 
 * Contains all grid trading parameters and analytics settings.
 * These are configuration constants, not secrets - they belong here, not in .env
 */

// Grid Configuration
export const GRID_LEVELS = 10;                    // Number of grid levels
export const GRID_SPACING_PERCENT = 2;            // % between each grid level
export const GRID_BASE_PRICE = 0;                 // Center price (0 = auto-detect)
export const AMOUNT_PER_GRID = 100;               // USD per grid order

// Trading Parameters
export const SLIPPAGE_TOLERANCE = 1.5;            // %
export const GAS_MULTIPLIER = 1.2;                // Gas price multiplier
export const MIN_PROFIT_PERCENT = 0.5;            // Minimum profit % to execute

// Timing Configuration
export const PRICE_CHECK_INTERVAL_SECONDS = 30;   // How often to check prices
export const STATUS_REPORT_INTERVAL_MINUTES = 60; // How often to report status
export const POST_TRADE_COOLDOWN_SECONDS = 60;    // Cooldown after a trade

// Gas Configuration
export const GAS_LIMIT = 250000;                  // Gas limit for transactions
export const COINGECKO_QUERY_INTERVAL_MS = 120000; // CoinGecko query interval

