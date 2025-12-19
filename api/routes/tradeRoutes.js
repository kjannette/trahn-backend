#!/usr/bin/env node

/**
 * Trade API Routes
 * HTTP endpoints for trade data
 */

import express from "express";
import { getTradeController } from "../../controllers/tradeController.js";

const router = express.Router();
const tradeController = getTradeController();

/**
 * GET /api/trades/today
 * Returns current trading day trade data
 */
router.get("/today", async (req, res) => {
    try {
        const trades = await tradeController.getCurrentDayTrades();
        res.json(trades);
    } catch (err) {
        console.error("Error fetching today's trades:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/trades/day/:date
 * Returns trade data for a specific trading day
 * Date format: YYYY-MM-DD
 */
router.get("/day/:date", async (req, res) => {
    try {
        const trades = await tradeController.getTradesByDay(req.params.date);
        
        // Format for frontend
        const formatted = trades.map(t => ({
            t: new Date(t.timestamp).getTime(),
            side: t.side,
            price: parseFloat(t.price),
            qty: parseFloat(t.quantity),
            gridLevel: t.gridLevel,
            usdValue: parseFloat(t.usdValue),
        }));
        
        res.json(formatted);
    } catch (err) {
        console.error(`Error fetching trades for ${req.params.date}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/trades/all
 * Returns recent trades (limit 100)
 */
router.get("/all", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const trades = await tradeController.getAllTrades(limit);
        res.json(trades);
    } catch (err) {
        console.error("Error fetching all trades:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/trades/stats
 * Returns trade statistics
 */
router.get("/stats", async (req, res) => {
    try {
        const stats = await tradeController.getTradeStats();
        res.json(stats);
    } catch (err) {
        console.error("Error fetching trade stats:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;

