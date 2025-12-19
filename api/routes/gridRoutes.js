#!/usr/bin/env node

/**
 * Grid API Routes
 * HTTP endpoints for grid state data
 */

import express from "express";
import { getGridStateController } from "../../controllers/gridStateController.js";

const router = express.Router();
const gridStateController = getGridStateController();

/**
 * GET /api/grid/current
 * Returns current grid levels and state
 */
router.get("/current", async (req, res) => {
    try {
        const state = await gridStateController.getActiveState();
        
        if (!state) {
            return res.json({ 
                grid: [],
                basePrice: null,
                tradesExecuted: 0,
                totalProfit: 0,
            });
        }
        
        res.json({
            basePrice: state.base_price ? parseFloat(state.base_price) : null,
            grid: state.grid_levels_json || [], // JSONB already parsed
            tradesExecuted: state.trades_executed || 0,
            totalProfit: state.total_profit ? parseFloat(state.total_profit) : 0,
            lastUpdate: state.updated_at,
        });
    } catch (err) {
        console.error("Error fetching grid state:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;

