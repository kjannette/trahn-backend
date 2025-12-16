#!/usr/bin/env node

/**
 * Dune Analytics API
 * 
 * Fetches support/resistance levels for ETH from Dune Analytics.
 * Used to calculate the true midpoint for grid trading.
 */

/**
 * DuneApi - Fetches S/R levels from Dune Analytics
 */
class DuneApi {
    constructor(apiKey, options = {}) {
        this.apiKey = apiKey;
        this.baseUrl = "https://api.dune.com/api/v1";
        this.method = options.method || "simple"; // "simple" or "percentile"
        this.lookbackDays = options.lookbackDays || 14;
        this.lastFetch = null;
        this.cachedResult = null;
        this.cacheValidMs = (options.refreshHours || 48) * 60 * 60 * 1000;
    }

    /**
     * Execute a SQL query on Dune Analytics
     */
    async executeQuery(sql) {
        if (!this.apiKey) {
            throw new Error("Dune API key not configured");
        }

        console.log("📊 [DUNE] Executing S/R query...");

        // Step 1: Submit query for execution
        const executeResponse = await fetch(`${this.baseUrl}/query/execute`, {
            method: "POST",
            headers: {
                "X-Dune-API-Key": this.apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query_sql: sql }),
        });

        if (!executeResponse.ok) {
            const errorText = await executeResponse.text();
            throw new Error(`Dune query execution failed: ${executeResponse.status} - ${errorText}`);
        }

        const executeResult = await executeResponse.json();
        const executionId = executeResult.execution_id;

        if (!executionId) {
            throw new Error("Dune did not return an execution ID");
        }

        console.log(`📊 [DUNE] Query submitted, execution ID: ${executionId}`);

        // Step 2: Poll for results
        const maxAttempts = 30;
        const pollIntervalMs = 2000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.sleep(pollIntervalMs);

            const statusResponse = await fetch(
                `${this.baseUrl}/execution/${executionId}/status`,
                {
                    headers: { "X-Dune-API-Key": this.apiKey },
                }
            );

            if (!statusResponse.ok) {
                console.warn(`📊 [DUNE] Status check failed, retrying...`);
                continue;
            }

            const statusResult = await statusResponse.json();
            const state = statusResult.state;

            if (state === "QUERY_STATE_COMPLETED") {
                // Step 3: Fetch results
                const resultsResponse = await fetch(
                    `${this.baseUrl}/execution/${executionId}/results`,
                    {
                        headers: { "X-Dune-API-Key": this.apiKey },
                    }
                );

                if (!resultsResponse.ok) {
                    throw new Error(`Failed to fetch Dune results: ${resultsResponse.status}`);
                }

                const resultsData = await resultsResponse.json();
                return resultsData.result?.rows || [];
            } else if (state === "QUERY_STATE_FAILED") {
                throw new Error(`Dune query failed: ${statusResult.error || "Unknown error"}`);
            }

            console.log(`📊 [DUNE] Query state: ${state}, waiting...`);
        }

        throw new Error("Dune query timed out after 60 seconds");
    }

    /**
     * Build SQL query for support/resistance based on method
     */
    buildSRQuery() {
        if (this.method === "percentile") {
            // Percentile-based: filters out extreme wicks
            return `
                SELECT 
                    approx_percentile(price, 0.05) as support,
                    approx_percentile(price, 0.95) as resistance,
                    approx_percentile(price, 0.50) as midpoint,
                    AVG(price) as avg_price,
                    MIN(price) as absolute_low,
                    MAX(price) as absolute_high
                FROM prices.usd
                WHERE symbol = 'WETH'
                    AND blockchain = 'ethereum'
                    AND minute > now() - interval '${this.lookbackDays}' day
            `;
        } else {
            // Simple high/low
            return `
                SELECT 
                    MIN(price) as support,
                    MAX(price) as resistance,
                    (MIN(price) + MAX(price)) / 2 as midpoint,
                    AVG(price) as avg_price
                FROM prices.usd
                WHERE symbol = 'WETH'
                    AND blockchain = 'ethereum'
                    AND minute > now() - interval '${this.lookbackDays}' day
            `;
        }
    }

    /**
     * Fetch support/resistance levels
     * Returns: { support, resistance, midpoint, avgPrice }
     */
    async fetchSupportResistance(forceRefresh = false) {
        // Check cache
        if (!forceRefresh && this.cachedResult && this.lastFetch) {
            const cacheAge = Date.now() - this.lastFetch;
            if (cacheAge < this.cacheValidMs) {
                console.log(`📊 [DUNE] Using cached S/R data (age: ${(cacheAge / 1000 / 60).toFixed(1)} min)`);
                return this.cachedResult;
            }
        }

        const sql = this.buildSRQuery();
        const rows = await this.executeQuery(sql);

        if (!rows || rows.length === 0) {
            throw new Error("Dune returned no data for S/R query");
        }

        const row = rows[0];
        const result = {
            support: parseFloat(row.support),
            resistance: parseFloat(row.resistance),
            midpoint: parseFloat(row.midpoint),
            avgPrice: parseFloat(row.avg_price),
            method: this.method,
            lookbackDays: this.lookbackDays,
            fetchedAt: new Date().toISOString(),
        };

        // Validate results
        if (isNaN(result.support) || isNaN(result.resistance) || isNaN(result.midpoint)) {
            throw new Error("Invalid S/R data from Dune");
        }

        if (result.support >= result.resistance) {
            throw new Error(`Invalid S/R range: support ${result.support} >= resistance ${result.resistance}`);
        }

        // Cache the result
        this.cachedResult = result;
        this.lastFetch = Date.now();

        console.log(`📊 [DUNE] S/R fetched successfully:`);
        console.log(`   Support: $${result.support.toFixed(2)}`);
        console.log(`   Resistance: $${result.resistance.toFixed(2)}`);
        console.log(`   Midpoint: $${result.midpoint.toFixed(2)}`);
        console.log(`   Method: ${result.method}, Lookback: ${result.lookbackDays} days`);

        return result;
    }

    /**
     * Check if S/R data needs refresh
     */
    needsRefresh() {
        if (!this.cachedResult || !this.lastFetch) {
            return true;
        }
        return (Date.now() - this.lastFetch) >= this.cacheValidMs;
    }

    /**
     * Get the next refresh time as a Date
     */
    getNextRefreshTime() {
        if (!this.lastFetch) {
            return new Date();
        }
        return new Date(this.lastFetch + this.cacheValidMs);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export { DuneApi };

