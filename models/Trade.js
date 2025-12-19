/**
 * Trade Model
 * Represents a single executed trade
 */

export class Trade {
    constructor(data) {
        this.id = data.id || null;
        this.timestamp = data.timestamp || new Date();
        this.tradingDay = data.trading_day || data.tradingDay;
        this.side = data.side; // "buy" or "sell"
        this.price = data.price;
        this.quantity = data.quantity;
        this.usdValue = data.usd_value || data.usdValue;
        this.gridLevel = data.grid_level || data.gridLevel;
        this.txHash = data.tx_hash || data.txHash;
        this.isPaperTrade = data.is_paper_trade || data.isPaperTrade || false;
        this.slippagePercent = data.slippage_percent || data.slippagePercent;
        this.gasCostEth = data.gas_cost_eth || data.gasCostEth;
        this.createdAt = data.created_at || data.createdAt;
    }

    /**
     * Convert to database row format
     */
    toRow() {
        return {
            timestamp: this.timestamp,
            trading_day: this.tradingDay,
            side: this.side,
            price: this.price,
            quantity: this.quantity,
            usd_value: this.usdValue,
            grid_level: this.gridLevel,
            tx_hash: this.txHash,
            is_paper_trade: this.isPaperTrade,
            slippage_percent: this.slippagePercent,
            gas_cost_eth: this.gasCostEth,
        };
    }

    /**
     * Create from database row
     */
    static fromRow(row) {
        return new Trade({
            id: row.id,
            timestamp: row.timestamp,
            tradingDay: row.trading_day,
            side: row.side,
            price: parseFloat(row.price),
            quantity: parseFloat(row.quantity),
            usdValue: parseFloat(row.usd_value),
            gridLevel: row.grid_level,
            txHash: row.tx_hash,
            isPaperTrade: row.is_paper_trade,
            slippagePercent: row.slippage_percent ? parseFloat(row.slippage_percent) : null,
            gasCostEth: row.gas_cost_eth ? parseFloat(row.gas_cost_eth) : null,
            createdAt: row.created_at,
        });
    }
}

