/**
 * PricePoint Model
 * Represents a single ETH price data point
 */

export class PricePoint {
    constructor(data) {
        this.id = data.id || null;
        this.timestamp = data.timestamp || new Date();
        this.price = data.price;
        this.tradingDay = data.trading_day || data.tradingDay;
        this.source = data.source || "coingecko";
        this.createdAt = data.created_at || data.createdAt;
    }

    /**
     * Convert to database row format
     */
    toRow() {
        return {
            timestamp: this.timestamp,
            price: this.price,
            trading_day: this.tradingDay,
            source: this.source,
        };
    }

    /**
     * Create from database row
     */
    static fromRow(row) {
        return new PricePoint({
            id: row.id,
            timestamp: row.timestamp,
            price: parseFloat(row.price),
            tradingDay: row.trading_day,
            source: row.source,
            createdAt: row.created_at,
        });
    }
}

