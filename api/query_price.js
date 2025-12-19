#!/usr/bin/env node

/**
 * Query current ETH price from CoinGecko
 */

async function getCurrentPrice() {
    try {
        const response = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await response.json();
        const price = parseFloat(data.ethereum.usd);
        
        console.log("\n" + "=".repeat(60));
        console.log("CURRENT ETH PRICE (CoinGecko)");
        console.log("=".repeat(60));
        console.log(`Price: $${price.toFixed(2)}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log("=".repeat(60));
        console.log("\nRaw API Response:");
        console.log(JSON.stringify(data, null, 2));
        console.log("=".repeat(60) + "\n");
        
        return price;
    } catch (err) {
        console.error("Failed to fetch ETH price:", err.message);
        process.exit(1);
    }
}

await getCurrentPrice();

