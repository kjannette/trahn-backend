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

export class SRScheduler {
    constructor(duneApiKey, options = {}) {
        this.duneApi = new DuneApi(duneApiKey, {
            method: options.method || "simple",
            lookbackDays: options.lookbackDays || 14,
            refreshHours: options.refreshHours || 2, // Not used here, cron handles timing
        });
        
        this.srController = getSupportResistanceController();
        this.cronExpression = options.cronExpression || "0 */2 * * *"; // Every 2 hours
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
            console.log("⏰ [SR-SCHEDULER] Already running");
            return;
        }

        // Initial S/R fetch on startup
        this.fetchAndProcessSR().catch(err => {
            console.error("⏰ [SR-SCHEDULER] Initial S/R fetch failed:", err.message);
        });

        // Schedule recurring job
        this.job = cron.schedule(this.cronExpression, async () => {
            await this.fetchAndProcessSR();
        });

        this.running = true;
        console.log(`⏰ [SR-SCHEDULER] Started with cron: ${this.cronExpression} (every 2 hours)`);
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
        console.log("⏰ [SR-SCHEDULER] Stopped");
    }

    /**
     * Fetch S/R from Dune and process
     */
    async fetchAndProcessSR() {
        try {
            console.log("⏰ [SR-SCHEDULER] Fetching S/R levels from Dune...");
            
            // Fetch from Dune
            const sr = await this.duneApi.fetchSupportResistance(true); // force refresh
            
            // Store in database (always mark as grid recalculated)
            const srRecord = await this.srController.recordSR({
                timestamp: new Date(),
                method: sr.method,
                lookbackDays: sr.lookbackDays,
                support: sr.support,
                resistance: sr.resistance,
                midpoint: sr.midpoint,
                avgPrice: sr.avgPrice,
                gridRecalculated: true, // Always recalculate every 2 hours
            });
            
            console.log(`⏰ [SR-SCHEDULER] S/R stored: Support $${sr.support.toFixed(2)} | Resistance $${sr.resistance.toFixed(2)} | Midpoint $${sr.midpoint.toFixed(2)}`);
            
            // Notify via callback
            if (this.onSRUpdate) {
                this.onSRUpdate(sr);
            }
            
            // ALWAYS trigger grid recalculation every 2 hours
            console.log(`⏰ [SR-SCHEDULER] 🔄 RECALCULATING GRID (scheduled refresh)`);
            
            if (this.onGridRecalculate) {
                await this.onGridRecalculate(sr);
            }
            
        } catch (err) {
            console.error(`⏰ [SR-SCHEDULER] Failed to fetch/process S/R: ${err.message}`);
        }
    }

    /**
     * Manually trigger S/R fetch
     */
    async fetchNow() {
        console.log("⏰ [SR-SCHEDULER] Manual S/R fetch triggered");
        await this.fetchAndProcessSR();
    }
}

/**
 * Factory function to create and configure scheduler
 */
export function createSRScheduler(duneApiKey, config) {
    return new SRScheduler(duneApiKey, config);
}

