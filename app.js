#!/usr/bin/env node

/**
 * Trahn Grid Trader - Application Entry Point
 * 
 * This is the root of the application. It starts:
 * 1. Express REST API server (port 3001)
 * 2. Grid trading bot agent
 * 3. S/R scheduler (cron jobs)
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import * as util from "util";

import { testConnection, closePool } from "./db/connection.js";
import { startGridBot, stopGridBot } from "./agents/gridBotServiceAgent.js";
import { createSRScheduler } from "./services/scheduler/srScheduler.js";
import * as config from "./configuration/config.js";

// Import routes
import priceRoutes from "./api/routes/priceRoutes.js";
import tradeRoutes from "./api/routes/tradeRoutes.js";
import gridRoutes from "./api/routes/gridRoutes.js";
import srRoutes from "./api/routes/srRoutes.js";

const API_PORT = 3001;

// Global instances
let apiServer = null;
let srScheduler = null;

/**
 * Main application startup
 */
async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ████████╗██████╗  █████╗ ██╗  ██╗███╗   ██╗                ║
║   ╚══██╔══╝██╔══██╗██╔══██╗██║  ██║████╗  ██║                ║
║      ██║   ██████╔╝███████║███████║██╔██╗ ██║                ║
║      ██║   ██╔══██╗██╔══██║██╔══██║██║╚██╗██║                ║
║      ██║   ██║  ██║██║  ██║██║  ██║██║ ╚████║                ║
║      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝                ║
║                                                              ║
║         E T H   G R I D   T R A D E R   v2.0.0               ║
║                                                              ║
║         Buy ETH Low • Sell ETH High • Repeat                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

    // Paper trading banner
    if (config.PAPER_TRADING_ENABLED) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   📝  P A P E R   T R A D I N G   M O D E   E N A B L E D   ║
║                                                              ║
║   • No real transactions will be broadcast                   ║
║   • Trades simulated against live market data                ║
║   • Virtual balances tracked in database                     ║
║   • Slippage and gas costs simulated                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    }

    // Validate configuration
    const validation = config.validateConfig();
    if (!validation.valid) {
        console.error("Configuration errors:");
        validation.errors.forEach((err) => console.error(`  - ${err}`));
        console.error("\nPlease check your .env file and try again.");
        process.exit(1);
    }

    // Test database connection
    console.log("\n📊 [DB] Testing PostgreSQL connection...");
    const dbConnected = await testConnection();
    if (!dbConnected) {
        console.error("❌ Database connection failed. Check .env credentials:");
        console.error("   Required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD");
        process.exit(1);
    }

    config.printConfig();

    // ==================== Start Services ====================

    // 1. Start Express API Server
    await startAPIServer();

    // 2. Start Grid Bot Agent
    await startGridBot();

    // 3. Start S/R Scheduler
    if (config.DUNE_API_KEY) {
        await startSRScheduler();
    } else {
        console.log("⏰ [SCHEDULER] Skipped - no Dune API key configured");
    }

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
        await shutdown();
    });

    process.on("SIGTERM", async () => {
        await shutdown();
    });

    console.log("\n✅ All services started successfully\n");
}

/**
 * Start Express API Server
 */
async function startAPIServer() {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Routes
    app.use("/api/prices", priceRoutes);
    app.use("/api/trades", tradeRoutes);
    app.use("/api/grid", gridRoutes);
    app.use("/api/support-resistance", srRoutes);

    // Health check
    app.get("/health", (req, res) => {
        res.json({ 
            status: "ok", 
            timestamp: new Date().toISOString(),
            services: {
                database: "connected",
                bot: "running",
                scheduler: srScheduler ? "running" : "stopped",
            }
        });
    });

    // 404 handler
    app.use((req, res) => {
        res.status(404).json({ error: "Endpoint not found" });
    });

    // Start server
    return new Promise((resolve) => {
        apiServer = app.listen(API_PORT, () => {
            console.log(`📡 [API] REST API server started on http://localhost:${API_PORT}`);
            console.log(`📡 [API] Health check: http://localhost:${API_PORT}/health`);
            resolve();
        });
    });
}

/**
 * Start S/R Scheduler
 */
async function startSRScheduler() {
    const { getGridBotInstance } = await import("./agents/gridBotServiceAgent.js");
    
    srScheduler = createSRScheduler(config.DUNE_API_KEY, {
        method: config.SR_METHOD,
        lookbackDays: config.SR_LOOKBACK_DAYS,
        cronExpression: "0 * * * *", // Every 1 hour
        srChangeThreshold: 5, // Recalculate if S/R changes >5%
        getBotInstance: getGridBotInstance, // Provide bot access for intelligent decisions
        onGridRecalculate: async (sr) => {
            const bot = getGridBotInstance();
            if (bot) {
                console.log("[SCHEDULER] Recalculating grid with new S/R midpoint...");
                await bot.initializeGrid();
            }
        },
        onSRUpdate: (sr) => {
            // S/R data updated (logged in scheduler)
        },
    });

    srScheduler.start();
    console.log("[SCHEDULER] S/R scheduler started (runs every 1 hour with intelligent recalculation)");
}

/**
 * Graceful shutdown
 */
async function shutdown() {
    console.log("\n🛑 Shutting down gracefully...");
    
    // Stop scheduler
    if (srScheduler) {
        srScheduler.stop();
    }
    
    // Stop bot
    await stopGridBot();
    
    // Close API server
    if (apiServer) {
        await new Promise((resolve) => {
            apiServer.close(() => {
                console.log("📡 [API] Server closed");
                resolve();
            });
        });
    }
    
    // Close database connections
    await closePool();
    
    console.log("✅ Shutdown complete");
    process.exit(0);
}

// Start the application
main().catch((err) => {
    console.error("Fatal error during startup:", err);
    process.exit(1);
});

