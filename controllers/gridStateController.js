#!/usr/bin/env node

/**
 * Grid State Controller
 * Data Access Layer for grid_state table
 * Handles both Paper Trading and Live Trading modes
 */

import { query } from "../db/connection.js";

export class GridStateController {
    /**
     * Get active grid state (latest)
     */
    async getActiveState() {
        const result = await query(
            `SELECT * FROM grid_state 
             WHERE is_active = true 
             ORDER BY updated_at DESC 
             LIMIT 1`
        );
        
        return result.rows.length > 0 ? result.rows[0] : null;
    }

    /**
     * Save/Update grid state (shared by both modes)
     */
    async saveGridState(data) {
        // Deactivate old states
        await query(`UPDATE grid_state SET is_active = false WHERE is_active = true`);
        
        // Insert new state
        const result = await query(
            `INSERT INTO grid_state 
             (base_price, grid_levels_json, trades_executed, total_profit, 
              last_sr_refresh, is_active, updated_at)
             VALUES ($1, $2, $3, $4, $5, true, NOW())
             RETURNING *`,
            [
                data.basePrice,
                JSON.stringify(data.gridLevelsJson),
                data.tradesExecuted || 0,
                data.totalProfit || 0,
                data.lastSRRefresh || null,
            ]
        );
        
        return result.rows[0];
    }

    /**
     * Update just the grid levels (faster than full save)
     */
    async updateGridLevels(gridLevels) {
        await query(
            `UPDATE grid_state 
             SET grid_levels_json = $1, updated_at = NOW() 
             WHERE is_active = true`,
            [JSON.stringify(gridLevels)]
        );
    }

    /**
     * Update trade count and profit (after a trade)
     */
    async updateTradeStats(tradesExecuted, totalProfit) {
        await query(
            `UPDATE grid_state 
             SET trades_executed = $1, total_profit = $2, updated_at = NOW() 
             WHERE is_active = true`,
            [tradesExecuted, totalProfit]
        );
    }

    // ==================== Paper Trading Methods ====================

    /**
     * Update paper wallet balances (Paper Mode Only)
     */
    async updatePaperWallet(data) {
        await query(
            `UPDATE grid_state 
             SET paper_eth_balance = $1,
                 paper_usdc_balance = $2,
                 paper_total_gas_spent = $3,
                 paper_trades_json = $4,
                 updated_at = NOW()
             WHERE is_active = true`,
            [
                data.ethBalance,
                data.usdcBalance,
                data.totalGasSpent || 0,
                JSON.stringify(data.trades || []),
            ]
        );
    }

    /**
     * Initialize paper wallet state (on first run)
     */
    async initializePaperWallet(initialETH, initialUSDC) {
        // Get active state
        const state = await this.getActiveState();
        
        if (state && state.paper_eth_balance !== null) {
            // Already initialized
            return;
        }
        
        // Initialize paper wallet columns
        await query(
            `UPDATE grid_state 
             SET paper_eth_balance = $1,
                 paper_usdc_balance = $2,
                 paper_initial_eth = $1,
                 paper_initial_usdc = $2,
                 paper_total_gas_spent = 0,
                 paper_trades_json = '[]'::jsonb,
                 paper_start_time = NOW(),
                 updated_at = NOW()
             WHERE is_active = true`,
            [initialETH, initialUSDC]
        );
    }

    /**
     * Get paper wallet data (Paper Mode Only)
     */
    async getPaperWallet() {
        const state = await this.getActiveState();
        if (!state) return null;
        
        return {
            ethBalance: state.paper_eth_balance ? parseFloat(state.paper_eth_balance) : null,
            usdcBalance: state.paper_usdc_balance ? parseFloat(state.paper_usdc_balance) : null,
            totalGasSpent: state.paper_total_gas_spent ? parseFloat(state.paper_total_gas_spent) : 0,
            trades: state.paper_trades_json || [], // JSONB already parsed
            startTime: state.paper_start_time,
            initialETH: state.paper_initial_eth ? parseFloat(state.paper_initial_eth) : null,
            initialUSDC: state.paper_initial_usdc ? parseFloat(state.paper_initial_usdc) : null,
        };
    }

    /**
     * Get state history (for analysis)
     */
    async getStateHistory(limit = 50) {
        const result = await query(
            `SELECT * FROM grid_state 
             ORDER BY updated_at DESC 
             LIMIT $1`,
            [limit]
        );
        
        return result.rows;
    }
}

// Singleton instance
let instance = null;

export function getGridStateController() {
    if (!instance) {
        instance = new GridStateController();
    }
    return instance;
}

