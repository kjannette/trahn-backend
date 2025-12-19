#!/usr/bin/env node

/**
 * Price API Routes
 * HTTP endpoints for price data
 */

import express from "express";
import { getPriceController } from "../../controllers/priceController.js";

const router = express.Router();
const priceController = getPriceController();

/**
 * GET /api/prices/today
 * Returns current trading day price data
 */
router.get("/today", async (req, res) => {
    try {
        const prices = await priceController.getCurrentDayPrices();
        res.json(prices);
    } catch (err) {
        console.error("Error fetching today's prices:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/prices/day/:date
 * Returns price data for a specific trading day
 * Date format: YYYY-MM-DD
 */
router.get("/day/:date", async (req, res) => {
    try {
        const prices = await priceController.getPricesByDay(req.params.date);
        
        // Format for frontend
        const formatted = prices.map(p => ({
            t: new Date(p.timestamp).getTime(),
            p: parseFloat(p.price),
        }));
        
        res.json(formatted);
    } catch (err) {
        console.error(`Error fetching prices for ${req.params.date}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/prices/days
 * Returns list of available trading days
 */
router.get("/days", async (req, res) => {
    try {
        const days = await priceController.getAvailableDays();
        res.json(days);
    } catch (err) {
        console.error("Error fetching available days:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/prices/latest
 * Returns the most recent price point
 */
router.get("/latest", async (req, res) => {
    try {
        const price = await priceController.getLatestPrice();
        if (!price) {
            return res.status(404).json({ error: "No price data available" });
        }
        res.json({
            t: new Date(price.timestamp).getTime(),
            p: parseFloat(price.price),
        });
    } catch (err) {
        console.error("Error fetching latest price:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;

