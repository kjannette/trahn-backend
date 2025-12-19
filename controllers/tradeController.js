#!/usr/bin/env node

/**
 * Trade History Controller
 * Data Access Layer for trade history table
 */

import { query } from "../db/connection.js";
import { Trade } from "../models/Trade.js";
import { getTradingDay } from "./priceController.js";

export class TradeController {
    /**
     * Record a trade
     */
    async recordTrade(tradeData) {
        const tradingDay = getTradingDay(tradeData.timestamp);
        
        const result = await query(
            `INSERT INTO trade_history 
             (timestamp, trading_day, side, price, quantity, usd_value, 
              grid_level, tx_hash, is_paper_trade, slippage_percent, gas_cost_eth)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                tradeData.timestamp || new Date(),
                tradingDay,
                tradeData.side,
                tradeData.price,
                tradeData.quantity,
                tradeData.usdValue,
                tradeData.gridLevel,
                tradeData.txHash || null,
                tradeData.isPaperTrade || false,
                tradeData.slippagePercent || null,
                tradeData.gasCostEth || null,
            ]
        );
        
        return Trade.fromRow(result.rows[0]);
    }

    /**
     * Get trades for a trading day
     */
    async getTradesByDay(tradingDay) {
        const result = await query(
            `SELECT * FROM trade_history 
             WHERE trading_day = $1 
             ORDER BY timestamp ASC`,
            [tradingDay]
        );
        
        return result.rows.map(row => Trade.fromRow(row));
    }

    /**
     * Get all trades (with limit)
     */
    async getAllTrades(limit = 100) {
        const result = await query(
            `SELECT * FROM trade_history 
             ORDER BY timestamp DESC 
             LIMIT $1`,
            [limit]
        );
        
        return result.rows.map(row => Trade.fromRow(row));
    }

    /**
     * Get trade statistics
     */
    async getTradeStats() {
        const result = await query(
            `SELECT 
                COUNT(*) as total_trades,
                COUNT(CASE WHEN side = 'buy' THEN 1 END) as buy_count,
                COUNT(CASE WHEN side = 'sell' THEN 1 END) as sell_count,
                SUM(usd_value) as total_volume,
                AVG(price) as avg_price,
                MIN(timestamp) as first_trade,
                MAX(timestamp) as last_trade
             FROM trade_history`
        );
        
        return result.rows[0];
    }

    /**
     * Get trades for current trading day (for frontend polling)
     */
    async getCurrentDayTrades() {
        const today = getTradingDay();
        const trades = await this.getTradesByDay(today);
        
        return trades.map(t => ({
            t: new Date(t.timestamp).getTime(),
            side: t.side,
            price: parseFloat(t.price),
            qty: parseFloat(t.quantity),
            gridLevel: t.gridLevel,
            usdValue: parseFloat(t.usdValue),
        }));
    }
}

// Singleton instance
let instance = null;

export function getTradeController() {
    if (!instance) {
        instance = new TradeController();
    }
    return instance;
}

