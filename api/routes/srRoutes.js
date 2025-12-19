#!/usr/bin/env node

/**
 * Support/Resistance API Routes
 * HTTP endpoints for S/R data
 */

import express from "express";
import { getSupportResistanceController } from "../../controllers/supportResistanceController.js";

const router = express.Router();
const srController = getSupportResistanceController();

/**
 * GET /api/support-resistance/latest
 * Returns the most recent S/R data
 */
router.get("/latest", async (req, res) => {
    try {
        const sr = await srController.getLatestSR();
        if (!sr) {
            return res.status(404).json({ error: "No S/R data available" });
        }
        res.json({
            support: parseFloat(sr.support),
            resistance: parseFloat(sr.resistance),
            midpoint: parseFloat(sr.midpoint),
            avgPrice: sr.avgPrice ? parseFloat(sr.avgPrice) : null,
            method: sr.method,
            lookbackDays: sr.lookbackDays,
            timestamp: sr.timestamp,
        });
    } catch (err) {
        console.error("Error fetching latest S/R:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/support-resistance/history
 * Returns historical S/R data
 */
router.get("/history", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const history = await srController.getSRHistory(limit);
        res.json(history);
    } catch (err) {
        console.error("Error fetching S/R history:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;

