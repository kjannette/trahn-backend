/**
 * SupportResistance Model
 * Represents S/R levels from Dune Analytics
 */

export class SupportResistance {
    constructor(data) {
        this.id = data.id || null;
        this.timestamp = data.timestamp || new Date();
        this.method = data.method;
        this.lookbackDays = data.lookback_days || data.lookbackDays;
        this.support = data.support;
        this.resistance = data.resistance;
        this.midpoint = data.midpoint;
        this.avgPrice = data.avg_price || data.avgPrice;
        this.gridRecalculated = data.grid_recalculated || data.gridRecalculated || false;
        this.createdAt = data.created_at || data.createdAt;
    }

    /**
     * Convert to database row format
     */
    toRow() {
        return {
            timestamp: this.timestamp,
            method: this.method,
            lookback_days: this.lookbackDays,
            support: this.support,
            resistance: this.resistance,
            midpoint: this.midpoint,
            avg_price: this.avgPrice,
            grid_recalculated: this.gridRecalculated,
        };
    }

    /**
     * Create from database row
     */
    static fromRow(row) {
        return new SupportResistance({
            id: row.id,
            timestamp: row.timestamp,
            method: row.method,
            lookbackDays: row.lookback_days,
            support: parseFloat(row.support),
            resistance: parseFloat(row.resistance),
            midpoint: parseFloat(row.midpoint),
            avgPrice: row.avg_price ? parseFloat(row.avg_price) : null,
            gridRecalculated: row.grid_recalculated,
            createdAt: row.created_at,
        });
    }

    /**
     * Check if S/R has changed significantly from previous
     */
    hasChangedSignificantly(previous, thresholdPercent = 5) {
        if (!previous) return true;
        
        const midpointChange = Math.abs((this.midpoint - previous.midpoint) / previous.midpoint) * 100;
        return midpointChange >= thresholdPercent;
    }
}

