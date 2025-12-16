# Grid Configuration: Support/Resistance Based Midpoint

This document explains how the ETH Grid Trader determines the grid's center price using Support/Resistance (S/R) analysis from Dune Analytics.

## The Problem

The original grid initialization used the **current ETH price at startup** as the grid's midpoint. This is problematic because:

- If the bot starts during a **price peak**, the midpoint is artificially high
- If the bot starts during a **price dip**, the midpoint is artificially low  
- The grid becomes lopsided relative to the *actual* trading range

## The Solution

Instead of using an arbitrary snapshot price, we now query **Dune Analytics** to calculate the true support and resistance levels over a configurable lookback period. The grid midpoint is then set at:

```
midpoint = (support + resistance) / 2
```

This ensures the grid is centered on the **actual trading range**, not random market noise.

---

## Configuration Variables

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DUNE_API_KEY` | *(none)* | Your Dune Analytics API key. Required for S/R calculation. |
| `SR_METHOD` | `simple` | Method for calculating S/R levels (see below) |
| `SR_REFRESH_HOURS` | `48` | How often to re-fetch S/R levels from Dune |
| `SR_LOOKBACK_DAYS` | `14` | How many days of price history to analyze |

### Command Line Arguments

You can override environment variables via CLI args:

```bash
# Override S/R method
node main.js --sr-method=percentile

# Override refresh frequency
node main.js --sr-refresh=24

# Override lookback period
node main.js --sr-lookback=7

# Combine multiple overrides
node main.js --sr-method=simple --sr-refresh=48 --sr-lookback=14
```

---

## S/R Calculation Methods

### `simple` (Default)

Uses absolute high/low over the lookback period:

```sql
SELECT 
    MIN(price) as support,
    MAX(price) as resistance,
    (MIN(price) + MAX(price)) / 2 as midpoint
FROM prices.usd
WHERE symbol = 'WETH'
    AND blockchain = 'ethereum'
    AND minute > now() - interval '14' day
```

**Pros:** Simple, fast, cheap on API credits  
**Cons:** Can be skewed by flash wicks / extreme outliers

### `percentile`

Uses 5th and 95th percentiles to filter outliers:

```sql
SELECT 
    approx_percentile(price, 0.05) as support,
    approx_percentile(price, 0.95) as resistance,
    approx_percentile(price, 0.50) as midpoint
FROM prices.usd
WHERE symbol = 'WETH'
    AND blockchain = 'ethereum'
    AND minute > now() - interval '14' day
```

**Pros:** Robust against flash crashes/spikes  
**Cons:** Slightly more expensive query

---

## Refresh Behavior

The S/R levels are **cached** after the initial fetch. They are refreshed when:

1. The cache expires (after `SR_REFRESH_HOURS`)
2. The bot restarts (and no valid cache exists)
3. Manually triggered (future feature)

### Current Defaults

| Setting | Value |
|---------|-------|
| S/R Method | `simple` (high/low) |
| Refresh Interval | 48 hours |
| Lookback Period | 14 days |

---

## Fallback Behavior

If the Dune API is unavailable or not configured:

1. A warning is logged at startup
2. The bot falls back to using the **current ETH price** as midpoint
3. Support/resistance are estimated as ±10% of current price

This ensures the bot can still run without Dune, but with less optimal grid placement.

---

## Example Output

When S/R is successfully fetched, you'll see:

```
📊 [DUNE] Executing S/R query...
📊 [DUNE] Query submitted, execution ID: 01JABC123...
📊 [DUNE] Query state: QUERY_STATE_EXECUTING, waiting...
📊 [DUNE] S/R fetched successfully:
   Support: $3,512.45
   Resistance: $4,125.80
   Midpoint: $3,819.12
   Method: simple, Lookback: 14 days

📊 S/R Analysis (simple, 14d): Support $3512.45 | Resistance $4125.80 | Midpoint $3819.12
Grid initialized: 10 levels from $3436.91 to $4213.32, center at $3819.12
```

---

## Future Enhancements

- [ ] Volume-weighted S/R levels
- [ ] Multiple timeframe analysis (daily + weekly)
- [ ] Dynamic grid recentering when price drifts beyond bounds
- [ ] WebSocket for real-time S/R updates

