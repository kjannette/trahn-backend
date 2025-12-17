#!/usr/bin/env node

/**
 * History Store
 * 
 * Manages persistent storage of price and trade history organized by day.
 * Each day (starting at 12:00:01 EST) gets its own file.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data directories
const BACKEND_DATA_DIR = path.join(__dirname);
const FRONTEND_DATA_DIR = path.join(__dirname, "../../frontend/public/data");

/**
 * Get the "trading day" date string for a given timestamp.
 * Trading day starts at 12:00:01 EST (17:00:01 UTC)
 * @param {Date|number} timestamp - Date object or Unix timestamp
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getTradingDay(timestamp = Date.now()) {
    const date = new Date(timestamp);
    
    // Convert to EST (UTC-5)
    const estOffset = -5 * 60; // minutes
    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    const estMinutes = utcMinutes + estOffset;
    
    // Trading day starts at 12:00:01 EST = 17:00:01 UTC
    // If before 17:00:01 UTC, we're still in "yesterday's" trading day
    const tradingDayStartUTC = 17 * 60 + 0; // 17:00 UTC in minutes
    
    let tradingDate = new Date(date);
    if (utcMinutes < tradingDayStartUTC) {
        // Before 12:00 EST, use previous day
        tradingDate.setUTCDate(tradingDate.getUTCDate() - 1);
    }
    
    return tradingDate.toISOString().split("T")[0];
}

/**
 * HistoryStore - Manages daily price and trade history
 */
class HistoryStore {
    constructor() {
        this.ensureDirectories();
        this.priceBuffer = [];
        this.tradeBuffer = [];
        this.lastFlush = Date.now();
        this.flushIntervalMs = 10000; // Flush to disk every 10 seconds
    }

    ensureDirectories() {
        const dirs = [
            BACKEND_DATA_DIR,
            FRONTEND_DATA_DIR,
            path.join(BACKEND_DATA_DIR, "price_history"),
            path.join(BACKEND_DATA_DIR, "trade_history"),
        ];
        
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Record a price point
     * @param {number} price - ETH price in USD
     * @param {number} timestamp - Unix timestamp (optional, defaults to now)
     */
    recordPrice(price, timestamp = Date.now()) {
        this.priceBuffer.push({
            t: timestamp,
            p: price,
        });
        
        this.maybeFlush();
    }

    /**
     * Record a trade
     * @param {Object} trade - Trade data
     */
    recordTrade(trade) {
        this.tradeBuffer.push({
            t: trade.timestamp || Date.now(),
            side: trade.side,
            price: trade.price,
            qty: trade.quantity,
            gridLevel: trade.gridLevel,
            usdValue: trade.usdValue,
        });
        
        this.maybeFlush();
    }

    /**
     * Flush buffers to disk if enough time has passed
     */
    maybeFlush() {
        if (Date.now() - this.lastFlush < this.flushIntervalMs) {
            return;
        }
        this.flush();
    }

    /**
     * Force flush all buffers to disk
     */
    flush() {
        this.flushPrices();
        this.flushTrades();
        this.updateFrontendData();
        this.lastFlush = Date.now();
    }

    /**
     * Flush price buffer to daily files
     */
    flushPrices() {
        if (this.priceBuffer.length === 0) return;

        // Group by trading day
        const byDay = {};
        for (const point of this.priceBuffer) {
            const day = getTradingDay(point.t);
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(point);
        }

        // Append to each day's file
        for (const [day, points] of Object.entries(byDay)) {
            const filePath = path.join(BACKEND_DATA_DIR, "price_history", `${day}.json`);
            const existing = this.loadJsonArray(filePath);
            existing.push(...points);
            this.saveJson(filePath, existing);
        }

        this.priceBuffer = [];
    }

    /**
     * Flush trade buffer to daily files
     */
    flushTrades() {
        if (this.tradeBuffer.length === 0) return;

        // Group by trading day
        const byDay = {};
        for (const trade of this.tradeBuffer) {
            const day = getTradingDay(trade.t);
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(trade);
        }

        // Append to each day's file
        for (const [day, trades] of Object.entries(byDay)) {
            const filePath = path.join(BACKEND_DATA_DIR, "trade_history", `${day}.json`);
            const existing = this.loadJsonArray(filePath);
            existing.push(...trades);
            this.saveJson(filePath, existing);
        }

        this.tradeBuffer = [];
    }

    /**
     * Update the frontend data files (for polling)
     */
    updateFrontendData() {
        const today = getTradingDay();
        
        // Get today's data
        const prices = this.getPriceHistory(today);
        const trades = this.getTradeHistory(today);
        
        // Get list of available days
        const availableDays = this.getAvailableDays();
        
        // Write current day data for frontend
        const frontendData = {
            currentDay: today,
            availableDays: availableDays,
            lastUpdate: Date.now(),
            prices: prices,
            trades: trades,
        };
        
        this.saveJson(path.join(FRONTEND_DATA_DIR, "current.json"), frontendData);
    }

    /**
     * Get price history for a specific day
     * @param {string} day - Date string YYYY-MM-DD
     * @returns {Array} Array of price points
     */
    getPriceHistory(day) {
        const filePath = path.join(BACKEND_DATA_DIR, "price_history", `${day}.json`);
        return this.loadJsonArray(filePath);
    }

    /**
     * Get trade history for a specific day
     * @param {string} day - Date string YYYY-MM-DD
     * @returns {Array} Array of trades
     */
    getTradeHistory(day) {
        const filePath = path.join(BACKEND_DATA_DIR, "trade_history", `${day}.json`);
        return this.loadJsonArray(filePath);
    }

    /**
     * Get data for a specific day (for frontend carousel)
     * @param {string} day - Date string YYYY-MM-DD
     * @returns {Object} Day data with prices and trades
     */
    getDayData(day) {
        return {
            day: day,
            prices: this.getPriceHistory(day),
            trades: this.getTradeHistory(day),
        };
    }

    /**
     * Get list of available days (that have data)
     * @returns {string[]} Array of date strings, sorted ascending
     */
    getAvailableDays() {
        const priceDir = path.join(BACKEND_DATA_DIR, "price_history");
        
        if (!fs.existsSync(priceDir)) {
            return [];
        }
        
        const files = fs.readdirSync(priceDir);
        const days = files
            .filter(f => f.endsWith(".json"))
            .map(f => f.replace(".json", ""))
            .sort();
        
        return days;
    }

    /**
     * Write day data to frontend folder (for carousel navigation)
     * @param {string} day - Date string YYYY-MM-DD
     */
    writeDayToFrontend(day) {
        const data = this.getDayData(day);
        const filePath = path.join(FRONTEND_DATA_DIR, `${day}.json`);
        this.saveJson(filePath, data);
    }

    /**
     * Write all available days to frontend (for initial load)
     */
    writeAllDaysToFrontend() {
        const days = this.getAvailableDays();
        for (const day of days) {
            this.writeDayToFrontend(day);
        }
        
        // Also write the index
        this.saveJson(path.join(FRONTEND_DATA_DIR, "index.json"), {
            availableDays: days,
            lastUpdate: Date.now(),
        });
    }

    // ==================== Utility Methods ====================

    loadJsonArray(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, "utf8");
                return JSON.parse(data);
            }
        } catch (err) {
            console.error(`Failed to load ${filePath}: ${err.message}`);
        }
        return [];
    }

    saveJson(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data));
        } catch (err) {
            console.error(`Failed to save ${filePath}: ${err.message}`);
        }
    }
}

// Singleton instance
let historyStoreInstance = null;

function getHistoryStore() {
    if (!historyStoreInstance) {
        historyStoreInstance = new HistoryStore();
    }
    return historyStoreInstance;
}

export { HistoryStore, getHistoryStore, getTradingDay };

