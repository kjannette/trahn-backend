#!/usr/bin/env node

/**
 * Quick script to query 14-day simple S/R midpoint from Dune Analytics
 * Usage: node api/query_sr.js
 */

import dotenv from "dotenv";
dotenv.config();

import { DuneApi } from "./duneApi.js";

async function main() {
    const apiKey = process.env.DUNE_API_KEY;
    
    if (!apiKey) {
        console.error("DUNE_API_KEY not found in environment variables.");
        console.error("   Please set it in your .env file or export it.");
        console.error("   Get your API key at: https://dune.com/settings/api");
        process.exit(1);
    }

    console.log("Querying Dune Analytics for 14-day simple S/R midpoint...\n");

    const duneApi = new DuneApi(apiKey, {
        method: "simple",
        lookbackDays: 14,
        refreshHours: 48,
    });

    try {
        const sr = await duneApi.fetchSupportResistance(true); // force refresh
        
        console.log("\n" + "=".repeat(60));
        console.log("14-DAY SIMPLE S/R ANALYSIS");
        console.log("=".repeat(60));
        console.log(`Support (14-day low):  $${sr.support.toFixed(2)}`);
        console.log(`Resistance (14-day high): $${sr.resistance.toFixed(2)}`);
        console.log(`Midpoint:              $${sr.midpoint.toFixed(2)}`);
        console.log(`Average Price:         $${sr.avgPrice.toFixed(2)}`);
        console.log("=".repeat(60));
        console.log(`Method: ${sr.method}`);
        console.log(`Lookback: ${sr.lookbackDays} days`);
        console.log(`Fetched: ${sr.fetchedAt}`);
        console.log("=".repeat(60) + "\n");
        
        console.log(`Grid midpoint would be set to: $${sr.midpoint.toFixed(2)}\n`);
        
    } catch (err) {
        console.error("Failed to fetch S/R data:", err.message);
        process.exit(1);
    }
}

await main();
