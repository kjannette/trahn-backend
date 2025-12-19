#!/usr/bin/env node

/**
 * Grid Strategy - Pure Business Logic
 * 
 * Contains all the algorithmic/mathematical logic for grid trading.
 * No I/O, no side effects - just pure functions that are easy to test.
 */

/**
 * GridLevel represents a single price level in the grid
 * For ETH grid trading:
 * - price = ETH price in USD
 * - quantity = ETH quantity to trade at this level
 * - side = "buy" (buy ETH with USDC) or "sell" (sell ETH for USDC)
 */
class GridLevel {
    constructor(index, price, side, quantity, filled = false) {
        this.index = index;
        this.price = price; // ETH price in USD
        this.side = side; // "buy" or "sell"
        this.quantity = quantity; // ETH quantity
        this.filled = filled;
        this.filledAt = null;
        this.txHash = null;
    }

    toJSON() {
        return {
            index: this.index,
            price: this.price,
            side: this.side,
            quantity: this.quantity,
            filled: this.filled,
            filledAt: this.filledAt,
            txHash: this.txHash,
        };
    }

    static fromJSON(json) {
        const level = new GridLevel(
            json.index,
            json.price,
            json.side,
            json.quantity,
            json.filled
        );
        level.filledAt = json.filledAt;
        level.txHash = json.txHash;
        return level;
    }
}

/**
 * Calculate the midpoint from support and resistance levels
 * @param {number} support - Support price level
 * @param {number} resistance - Resistance price level
 * @returns {number} The midpoint price
 */
function calculateMidpoint(support, resistance) {
    if (support >= resistance) {
        throw new Error(`Invalid S/R: support (${support}) >= resistance (${resistance})`);
    }
    return (support + resistance) / 2;
}

/**
 * Calculate grid levels around a center price
 * @param {Object} options - Grid configuration
 * @param {number} options.centerPrice - The center price for the grid
 * @param {number} options.levelCount - Total number of grid levels
 * @param {number} options.spacingPercent - Percentage spacing between levels
 * @param {number} options.amountPerGrid - USD amount per grid level
 * @returns {GridLevel[]} Array of grid levels sorted by price ascending
 */
function calculateGridLevels({ centerPrice, levelCount, spacingPercent, amountPerGrid }) {
    if (centerPrice <= 0) {
        throw new Error("Center price must be positive");
    }
    if (levelCount < 2) {
        throw new Error("Level count must be at least 2");
    }
    if (spacingPercent <= 0) {
        throw new Error("Spacing percent must be positive");
    }
    if (amountPerGrid <= 0) {
        throw new Error("Amount per grid must be positive");
    }

    const grid = [];
    const halfLevels = Math.floor(levelCount / 2);

    // Create grid levels above and below center ETH price
    for (let i = -halfLevels; i <= halfLevels; i++) {
        if (i === 0 && levelCount % 2 === 0) continue; // Skip center for even grids

        const priceMultiplier = Math.pow(1 + spacingPercent / 100, i);
        const levelPrice = centerPrice * priceMultiplier;

        // Below center = buy ETH (price dropped), above center = sell ETH (price rose)
        const side = i < 0 ? "buy" : "sell";

        // Calculate ETH quantity based on USD amount and ETH price at this level
        const quantity = amountPerGrid / levelPrice;

        const level = new GridLevel(
            grid.length,
            levelPrice,
            side,
            quantity,
            false
        );

        grid.push(level);
    }

    // Sort by price ascending
    grid.sort((a, b) => a.price - b.price);

    // Re-index after sort
    grid.forEach((level, idx) => {
        level.index = idx;
    });

    return grid;
}

/**
 * Find a triggered grid level based on current price
 * @param {number} currentPrice - Current ETH price
 * @param {GridLevel[]} grid - Array of grid levels
 * @returns {GridLevel|null} The triggered level, or null if none triggered
 */
function findTriggeredLevel(currentPrice, grid) {
    for (const level of grid) {
        if (level.filled) continue;

        // Buy ETH when price drops to or below buy level
        if (level.side === "buy" && currentPrice <= level.price) {
            return level;
        }
        // Sell ETH when price rises to or above sell level
        if (level.side === "sell" && currentPrice >= level.price) {
            return level;
        }
    }
    return null;
}

/**
 * Get the opposite level index for a filled level
 * When a buy is filled, the adjacent sell becomes active (and vice versa)
 * @param {GridLevel} filledLevel - The level that was just filled
 * @param {number} gridLength - Total number of grid levels
 * @returns {number|null} The opposite level index, or null if out of bounds
 */
function getOppositeLevelIndex(filledLevel, gridLength) {
    const oppositeIndex = filledLevel.side === "buy"
        ? filledLevel.index + 1
        : filledLevel.index - 1;

    if (oppositeIndex >= 0 && oppositeIndex < gridLength) {
        return oppositeIndex;
    }
    return null;
}

/**
 * Get grid statistics
 * @param {GridLevel[]} grid - Array of grid levels
 * @returns {Object} Grid statistics
 */
function getGridStats(grid) {
    if (!grid || grid.length === 0) {
        return {
            levels: 0,
            lowestPrice: null,
            highestPrice: null,
            filledLevels: 0,
            pendingBuys: 0,
            pendingSells: 0,
            filledBuys: 0,
            filledSells: 0,
        };
    }

    return {
        levels: grid.length,
        lowestPrice: grid[0].price,
        highestPrice: grid[grid.length - 1].price,
        filledLevels: grid.filter(l => l.filled).length,
        pendingBuys: grid.filter(l => l.side === "buy" && !l.filled).length,
        pendingSells: grid.filter(l => l.side === "sell" && !l.filled).length,
        filledBuys: grid.filter(l => l.side === "buy" && l.filled).length,
        filledSells: grid.filter(l => l.side === "sell" && l.filled).length,
    };
}

/**
 * Format grid levels for display
 * @param {GridLevel[]} grid - Array of grid levels
 * @param {number} centerPrice - Center price for reference
 * @param {number} amountPerGrid - USD amount per level
 * @returns {string} Formatted grid display string
 */
function formatGridDisplay(grid, centerPrice, amountPerGrid) {
    if (!grid || grid.length === 0) {
        return "No grid levels initialized.";
    }

    const lines = [];
    lines.push("┌─────────────────────────────────────────────────┐");
    lines.push("│              GRID LEVELS (USD)               │");
    lines.push("├─────────────────────────────────────────────────┤");

    // Sort by price descending for display (highest first)
    const sortedGrid = [...grid].sort((a, b) => b.price - a.price);

    for (const level of sortedGrid) {
        const sideIcon = level.side === "sell" ? "SELL" : "BUY ";
        const status = level.filled ? "[X]" : "[ ]";
        const priceStr = `$${level.price.toFixed(2)}`.padStart(10);
        const qtyStr = `${level.quantity.toFixed(6)} ETH`.padStart(15);

        lines.push(`│ ${status} ${sideIcon} @ ${priceStr} │ ${qtyStr} │`);
    }

    lines.push("├─────────────────────────────────────────────────┤");
    lines.push(`│  Center: $${(centerPrice || 0).toFixed(2).padStart(8)}  │  $${amountPerGrid}/level  │`);
    lines.push("└─────────────────────────────────────────────────┘");

    return lines.join("\n");
}

/**
 * Create a fallback S/R result when Dune is unavailable
 * Estimates support/resistance as ±10% of current price
 * @param {number} currentPrice - Current ETH price
 * @returns {Object} Fallback S/R data
 */
function createFallbackSR(currentPrice) {
    return {
        support: currentPrice * 0.9,
        resistance: currentPrice * 1.1,
        midpoint: currentPrice,
        method: "fallback",
        lookbackDays: 0,
    };
}

/**
 * Check if price has broken out of grid range
 * @param {number} currentPrice - Current ETH price
 * @param {GridLevel[]} grid - Array of grid levels
 * @returns {boolean} True if price is outside grid range
 */
function isPriceOutsideGrid(currentPrice, grid) {
    if (!grid || grid.length === 0) return true;
    
    const lowestLevel = Math.min(...grid.map(g => g.price));
    const highestLevel = Math.max(...grid.map(g => g.price));
    
    return currentPrice < lowestLevel || currentPrice > highestLevel;
}

/**
 * Check if all levels on one side are filled
 * @param {GridLevel[]} grid - Array of grid levels
 * @param {string} side - "buy" or "sell"
 * @returns {boolean} True if all levels on specified side are filled
 */
function areAllSideFilled(grid, side) {
    const sideLevels = grid.filter(g => g.side === side);
    if (sideLevels.length === 0) return false;
    return sideLevels.every(g => g.filled);
}

/**
 * Calculate S/R midpoint change percentage
 * @param {number} newMidpoint - New midpoint value
 * @param {number} oldMidpoint - Previous midpoint value
 * @returns {number} Percentage change
 */
function calculateSRChange(newMidpoint, oldMidpoint) {
    if (!oldMidpoint) return 100;
    return Math.abs((newMidpoint - oldMidpoint) / oldMidpoint * 100);
}

export {
    GridLevel,
    calculateMidpoint,
    calculateGridLevels,
    findTriggeredLevel,
    getOppositeLevelIndex,
    getGridStats,
    formatGridDisplay,
    createFallbackSR,
    isPriceOutsideGrid,
    areAllSideFilled,
    calculateSRChange,
};

