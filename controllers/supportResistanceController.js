#!/usr/bin/env node

/**
 * Support/Resistance Controller
 * Data Access Layer for S/R history table
 */

import { query } from "../db/connection.js";
import { SupportResistance } from "../models/SupportResistance.js";

export class SupportResistanceController {
    /**
     * Record S/R data from Dune Analytics
     */
    async recordSR(srData) {
        const result = await query(
            `INSERT INTO support_resistance_history 
             (timestamp, method, lookback_days, support, resistance, midpoint, avg_price, grid_recalculated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                srData.timestamp || new Date(),
                srData.method,
                srData.lookbackDays,
                srData.support,
                srData.resistance,
                srData.midpoint,
                srData.avgPrice || null,
                srData.gridRecalculated || false,
            ]
        );
        
        return SupportResistance.fromRow(result.rows[0]);
    }

    /**
     * Get latest S/R data
     */
    async getLatestSR() {
        const result = await query(
            `SELECT * FROM support_resistance_history 
             ORDER BY timestamp DESC 
             LIMIT 1`
        );
        
        if (result.rows.length === 0) return null;
        return SupportResistance.fromRow(result.rows[0]);
    }

    /**
     * Get S/R history (for analysis)
     */
    async getSRHistory(limit = 100) {
        const result = await query(
            `SELECT * FROM support_resistance_history 
             ORDER BY timestamp DESC 
             LIMIT $1`,
            [limit]
        );
        
        return result.rows.map(row => SupportResistance.fromRow(row));
    }

    /**
     * Check if S/R needs refresh based on last record
     */
    async needsRefresh(refreshHours = 48) {
        const latest = await this.getLatestSR();
        if (!latest) return true;
        
        const ageMs = Date.now() - new Date(latest.timestamp).getTime();
        const refreshMs = refreshHours * 60 * 60 * 1000;
        return ageMs >= refreshMs;
    }
}

// Singleton instance
let instance = null;

export function getSupportResistanceController() {
    if (!instance) {
        instance = new SupportResistanceController();
    }
    return instance;
}

