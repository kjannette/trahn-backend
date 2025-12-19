#!/usr/bin/env node

/**
 * Price History Controller
 * Data Access Layer for price history table
 */

import { query } from "../db/connection.js";
import { PricePoint } from "../models/PricePoint.js";

/**
 * Get trading day for a timestamp (12:00 EST boundary)
 */
function getTradingDay(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const tradingDayStartUTC = 17 * 60; // 17:00 UTC = 12:00 EST
    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    
    let tradingDate = new Date(date);
    if (utcMinutes < tradingDayStartUTC) {
        tradingDate.setUTCDate(tradingDate.getUTCDate() - 1);
    }
    
    return tradingDate.toISOString().split("T")[0];
}

export class PriceController {
    /**
     * Record a price point
     */
    async recordPrice(price, timestamp = new Date()) {
        const tradingDay = getTradingDay(timestamp);
        
        const result = await query(
            `INSERT INTO price_history (timestamp, price, trading_day, source)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [timestamp, price, tradingDay, "coingecko"]
        );
        
        return PricePoint.fromRow(result.rows[0]);
    }

    /**
     * Get price history for a trading day
     */
    async getPricesByDay(tradingDay) {
        const result = await query(
            `SELECT * FROM price_history 
             WHERE trading_day = $1 
             ORDER BY timestamp ASC`,
            [tradingDay]
        );
        
        return result.rows.map(row => PricePoint.fromRow(row));
    }

    /**
     * Get available trading days
     */
    async getAvailableDays() {
        const result = await query(
            `SELECT DISTINCT trading_day 
             FROM price_history 
             ORDER BY trading_day DESC 
             LIMIT 30`
        );
        
        return result.rows.map(row => row.trading_day);
    }

    /**
     * Get latest price
     */
    async getLatestPrice() {
        const result = await query(
            `SELECT * FROM price_history 
             ORDER BY timestamp DESC 
             LIMIT 1`
        );
        
        if (result.rows.length === 0) return null;
        return PricePoint.fromRow(result.rows[0]);
    }

    /**
     * Get prices for current trading day (for frontend polling)
     */
    async getCurrentDayPrices() {
        const today = getTradingDay();
        const prices = await this.getPricesByDay(today);
        
        return prices.map(p => ({
            t: new Date(p.timestamp).getTime(),
            p: parseFloat(p.price),
        }));
    }
}

// Singleton instance
let instance = null;

export function getPriceController() {
    if (!instance) {
        instance = new PriceController();
    }
    return instance;
}

export { getTradingDay };

