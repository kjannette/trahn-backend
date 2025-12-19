#!/usr/bin/env node

/**
 * Support/Resistance Scheduler
 * 
 * Runs as a cron job to:
 * 1. Fetch S/R levels from Dune every 2 hours
 * 2. Store results in database
 * 3. Trigger grid recalculation if S/R changes significantly
 */

import cron from "node-cron";
import { DuneApi } from "../../api/duneApi.js";
import { getSupportResistanceController } from "../../controllers/supportResistanceController.js";
import { isPriceOutsideGrid, areAllSideFilled } from "../strategy/gridStrategy.js";

export class SRScheduler {
    constructor(duneApiKey, options = {}) {
        this.duneApi = new DuneApi(duneApiKey, {
            method: options.method || "simple",
            lookbackDays: options.lookbackDays || 14,
            refreshHours: options.refreshHours || 1, // Not used here, cron handles timing
        });
        
        this.srController = getSupportResistanceController();
        this.cronExpression = options.cronExpression || "0 * * * *"; // Every 1 hour
        this.srChangeThreshold = options.srChangeThreshold || 5; // 5% threshold
        this.getBotInstance = options.getBotInstance || null; // Access to bot for decision making
        this.onGridRecalculate = options.onGridRecalculate || null; // Callback when grid should recalc
        this.onSRUpdate = options.onSRUpdate || null; // Callback when S/R updates
        this.job = null;
        this.running = false;
    }

    /**
     * Start the scheduler
     */
    start() {
        if (this.running) {
            console.log("[SR-SCHEDULER] Already running");
            return;
        }

        // Initial S/R fetch on startup
        this.fetchAndProcessSR().catch(err => {
            console.error("[SR-SCHEDULER] Initial S/R fetch failed:", err.message);
        });

        // Schedule recurring job
        this.job = cron.schedule(this.cronExpression, async () => {
            await this.fetchAndProcessSR();
        });

        this.running = true;
        console.log(`[SR-SCHEDULER] Started with cron: ${this.cronExpression} (every 1 hour)`);
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
        }
        this.running = false;
        console.log("[SR-SCHEDULER] Stopped");
    }

    /**
     * Fetch S/R from Dune and process with intelligent recalculation logic
     */
    async fetchAndProcessSR() {
        try {
            console.log("[SR-SCHEDULER] Fetching S/R levels from Dune...");
            
            // Fetch from Dune
            const sr = await this.duneApi.fetchSupportResistance(true);
            
            // Get bot instance for decision making
            const bot = this.getBotInstance ? this.getBotInstance() : null;
            
            // DECISION LOGIC: Determine if grid should recalculate
            let shouldRecalculate = false;
            const reasons = [];
            
            // Condition 1: S/R change > 5%
            const srChange = await this.srController.checkSignificantChange(sr, this.srChangeThreshold);
            if (srChange.hasChanged) {
                shouldRecalculate = true;
                reasons.push(`S/R midpoint changed ${srChange.changePercent}%`);
            }
            
            // Condition 2: Price outside grid range
            if (bot && bot.grid.length > 0) {
                const currentPrice = bot.lastETHPrice;
                
                if (currentPrice > 0) {
                    const isOutside = isPriceOutsideGrid(currentPrice, bot.grid);
                    
                    if (isOutside) {
                        shouldRecalculate = true;
                        const lowestLevel = Math.min(...bot.grid.map(g => g.price));
                        const highestLevel = Math.max(...bot.grid.map(g => g.price));
                        reasons.push(`Price $${currentPrice.toFixed(2)} outside grid range ($${lowestLevel.toFixed(2)} - $${highestLevel.toFixed(2)})`);
                    }
                }
                
                // Condition 3: All buys or all sells filled
                const allBuysFilled = areAllSideFilled(bot.grid, 'buy');
                const allSellsFilled = areAllSideFilled(bot.grid, 'sell');
                
                if (allBuysFilled) {
                    shouldRecalculate = true;
                    reasons.push('All buy levels filled - opportunity to reset');
                }
                
                if (allSellsFilled) {
                    shouldRecalculate = true;
                    reasons.push('All sell levels filled - opportunity to reset');
                }
            }
            
            // Store S/R data
            await this.srController.recordSR({
                timestamp: new Date(),
                method: sr.method,
                lookbackDays: sr.lookbackDays,
                support: sr.support,
                resistance: sr.resistance,
                midpoint: sr.midpoint,
                avgPrice: sr.avgPrice,
                gridRecalculated: shouldRecalculate,
            });
            
            console.log(`[SR-SCHEDULER] S/R stored: Support $${sr.support.toFixed(2)} | Resistance $${sr.resistance.toFixed(2)} | Midpoint $${sr.midpoint.toFixed(2)}`);
            
            // Notify via callback
            if (this.onSRUpdate) {
                this.onSRUpdate(sr);
            }
            
            // Recalculate grid if conditions met
            if (shouldRecalculate) {
                console.log(`[SR-SCHEDULER] RECALCULATING GRID - Reasons: ${reasons.join(', ')}`);
                
                if (this.onGridRecalculate) {
                    await this.onGridRecalculate(sr);
                }
            } else {
                console.log(`[SR-SCHEDULER] Grid stable - no recalculation needed`);
                console.log(`  S/R change: ${srChange.changePercent || 0}% (threshold: ${this.srChangeThreshold}%)`);
                if (bot && bot.lastETHPrice > 0) {
                    console.log(`  Price in range: Yes ($${bot.lastETHPrice.toFixed(2)})`);
                }
                console.log(`  All buys/sells filled: No`);
            }
            
        } catch (err) {
            console.error(`[SR-SCHEDULER] Failed to fetch/process S/R: ${err.message}`);
        }
    }

    /**
     * Manually trigger S/R fetch
     */
    async fetchNow() {
        console.log("[SR-SCHEDULER] Manual S/R fetch triggered");
        await this.fetchAndProcessSR();
    }
}

/**
 * Factory function to create and configure scheduler
 */
export function createSRScheduler(duneApiKey, config) {
    return new SRScheduler(duneApiKey, config);
}

