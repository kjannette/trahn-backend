#!/usr/bin/env node

/**
 * ETH Grid Trading Bot
 * 
 * Trades ETH against a stablecoin (USDC) using a grid strategy.
 * - Buy ETH when price drops to lower grid levels
 * - Sell ETH when price rises to upper grid levels
 * - Profit from ETH price oscillations within the grid range
 */

import { ethers } from "ethers";
import Web3 from "web3";
import { Transaction as EthTx } from "ethereumjs-tx";
import * as fs from "fs";
import * as util from "util";

import {
    ChainId,
    Fetcher,
    JSBI,
    Percent,
    Route,
    Token,
    TokenAmount,
    Trade,
    TradeType,
    WETH,
} from "@uniswap/sdk";

import IUniswapV2Router02 from "@uniswap/v2-periphery/build/IUniswapV2Router02.json" with { type: "json" };

import { sleep, sleepSeconds } from "../utilities/sleep.js";
import * as config from "../configuration/config.js";
import { DuneApi } from "../api/duneApi.js";
import { getHistoryStore } from "../data/historyStore.js";
import {
    GridLevel,
    calculateMidpoint,
    calculateGridLevels,
    findTriggeredLevel,
    getOppositeLevelIndex,
    getGridStats,
    formatGridDisplay,
    createFallbackSR,
} from "../services/strategy/gridStrategy.js";

/**
 * Explorer Configuration
 * Used for displaying transaction links
 */
const EXPLORER_TX_PREFIX = "https://etherscan.io/tx/";

const ERC20_ABI = [
    {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "symbol",
        outputs: [{ name: "", type: "string" }],
        type: "function",
    },
    {
        constant: false,
        inputs: [
            { name: "_spender", type: "address" },
            { name: "_value", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        type: "function",
    },
    {
        constant: true,
        inputs: [
            { name: "_owner", type: "address" },
            { name: "_spender", type: "address" },
        ],
        name: "allowance",
        outputs: [{ name: "", type: "uint256" }],
        type: "function",
    },
];

// GridLevel class is now imported from strategy/gridStrategy.js

/**
 * PaperWallet - Virtual wallet for paper trading simulation
 * Tracks simulated ETH and USDC balances, trade history, and metrics
 */
class PaperWallet {
    constructor(initialETH, initialUSDC, stateFilePath) {
        this.stateFilePath = stateFilePath;
        this.initialETH = initialETH;
        this.initialUSDC = initialUSDC;
        this.ethBalance = initialETH;
        this.usdcBalance = initialUSDC;
        this.trades = [];
        this.totalGasSpent = 0;
        this.startTime = Date.now();
        this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const data = fs.readFileSync(this.stateFilePath, "utf8");
                const state = JSON.parse(data);
                this.ethBalance = state.ethBalance ?? this.initialETH;
                this.usdcBalance = state.usdcBalance ?? this.initialUSDC;
                this.trades = state.trades || [];
                this.totalGasSpent = state.totalGasSpent || 0;
                this.startTime = state.startTime || Date.now();
                this.initialETH = state.initialETH ?? this.initialETH;
                this.initialUSDC = state.initialUSDC ?? this.initialUSDC;
                console.log(`📝 [PAPER] Loaded state: ${this.ethBalance.toFixed(6)} ETH, ${this.usdcBalance.toFixed(2)} USDC, ${this.trades.length} trades`);
            } else {
                console.log(`📝 [PAPER] Starting fresh paper wallet: ${this.initialETH} ETH, ${this.initialUSDC} USDC`);
            }
        } catch (err) {
            console.error(`📝 [PAPER] Failed to load paper state: ${err.message}`);
        }
    }

    saveState() {
        try {
            const state = {
                ethBalance: this.ethBalance,
                usdcBalance: this.usdcBalance,
                trades: this.trades,
                totalGasSpent: this.totalGasSpent,
                startTime: this.startTime,
                initialETH: this.initialETH,
                initialUSDC: this.initialUSDC,
                lastUpdate: Date.now(),
            };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
        } catch (err) {
            console.error(`📝 [PAPER] Failed to save paper state: ${err.message}`);
        }
    }

    recordTrade(tradeData) {
        const trade = {
            id: this.trades.length + 1,
            timestamp: new Date().toISOString(),
            ...tradeData,
            balanceAfter: {
                eth: this.ethBalance,
                usdc: this.usdcBalance,
            },
        };
        this.trades.push(trade);
        this.saveState();
        return trade;
    }

    deductGas(gasETH) {
        this.ethBalance -= gasETH;
        this.totalGasSpent += gasETH;
    }

    // Buy ETH with USDC
    executeBuy(usdcAmount, ethAmount) {
        if (this.usdcBalance < usdcAmount) {
            throw new Error(`Insufficient USDC: have ${this.usdcBalance.toFixed(2)}, need ${usdcAmount.toFixed(2)}`);
        }
        this.usdcBalance -= usdcAmount;
        this.ethBalance += ethAmount;
        this.saveState();
    }

    // Sell ETH for USDC
    executeSell(ethAmount, usdcAmount) {
        if (this.ethBalance < ethAmount) {
            throw new Error(`Insufficient ETH: have ${this.ethBalance.toFixed(6)}, need ${ethAmount.toFixed(6)}`);
        }
        this.ethBalance -= ethAmount;
        this.usdcBalance += usdcAmount;
        this.saveState();
    }

    getStats(currentETHPrice) {
        const initialValueUSD = (this.initialETH * currentETHPrice) + this.initialUSDC;
        const currentValueUSD = (this.ethBalance * currentETHPrice) + this.usdcBalance;
        const unrealizedPnL = currentValueUSD - initialValueUSD;
        const unrealizedPnLPercent = initialValueUSD > 0 ? (unrealizedPnL / initialValueUSD) * 100 : 0;
        
        const buyTrades = this.trades.filter(t => t.side === "buy").length;
        const sellTrades = this.trades.filter(t => t.side === "sell").length;
        const runningTimeMs = Date.now() - this.startTime;
        const runningTimeHours = runningTimeMs / (1000 * 60 * 60);

        return {
            initialETH: this.initialETH,
            initialUSDC: this.initialUSDC,
            currentETH: this.ethBalance,
            currentUSDC: this.usdcBalance,
            initialValueUSD,
            currentValueUSD,
            unrealizedPnL,
            unrealizedPnLPercent,
            totalTrades: this.trades.length,
            buyTrades,
            sellTrades,
            totalGasSpent: this.totalGasSpent,
            gasSpentUSD: this.totalGasSpent * currentETHPrice,
            runningTimeHours,
        };
    }

    reset() {
        this.ethBalance = this.initialETH;
        this.usdcBalance = this.initialUSDC;
        this.trades = [];
        this.totalGasSpent = 0;
        this.startTime = Date.now();
        this.saveState();
        console.log("📝 [PAPER] Paper wallet reset to initial state");
    }
}

/**
 * ETHGridTradingBot - A grid trading bot for ETH
 * 
 * Grid trading strategy:
 * - Creates a grid of buy/sell orders at predetermined ETH price levels
 * - Buys ETH (with USDC) when price drops to lower grid levels
 * - Sells ETH (for USDC) when price rises to upper grid levels
 * - Profits from ETH price oscillations within the grid range
 */
class TrahnGridTradingBot {
    constructor(options) {
        // Paper trading mode
        this.paperTrading = options.paperTrading || false;
        this.paperSlippagePercent = options.paperSlippagePercent || 0.5;
        this.paperSimulateGas = options.paperSimulateGas !== false;

        // Wallet setup
        this.walletAddress = options.walletAddress;
        
        if (this.paperTrading) {
            // Paper trading mode - no real private key needed
            this.privateKey = Buffer.alloc(32); // Dummy key
            console.log("📝 [PAPER] Paper trading mode - private key not required");
        } else {
            // Live trading mode - validate private key
            if (!options.privateKey || !options.privateKey.startsWith("0x")) {
                throw new Error("Private key must start with 0x");
            }
            this.privateKey = Buffer.from(options.privateKey.substring(2), "hex");
        }

        // Quote token setup (stablecoin like USDC)
        this.quoteTokenAddress = options.quoteTokenAddress;
        this.quoteTokenSymbol = options.quoteTokenSymbol;
        this.quoteTokenDecimals = options.quoteTokenDecimals;
        this.chainId = options.chainId || ChainId.MAINNET;

        // Create Quote Token instance
        this.quoteToken = new Token(
            this.chainId,
            this.quoteTokenAddress,
            this.quoteTokenDecimals,
            this.quoteTokenSymbol
        );

        // Grid configuration
        this.gridLevels = options.gridLevels || 10;
        this.gridSpacingPercent = options.gridSpacingPercent || 2;
        this.amountPerGrid = options.amountPerGrid || 100; // USD
        this.basePrice = options.basePrice || 0; // 0 = auto-detect

        // Trading parameters
        this.slippageTolerance = options.slippageTolerance || 1.5;
        this.gasMultiplier = options.gasMultiplier || 1.2;
        this.gasLimit = options.gasLimit || 250000;
        this.minProfitPercent = options.minProfitPercent || 0.5;

        // Timing
        this.priceCheckIntervalSeconds = options.priceCheckIntervalSeconds || 30;
        this.statusReportIntervalMinutes = options.statusReportIntervalMinutes || 60;
        this.postTradeCooldownSeconds = options.postTradeCooldownSeconds || 60;

        // State
        this.stateFilePath = options.stateFilePath;
        this.grid = [];
        this.running = false;
        this.lastStatusReportTime = new Date(0);
        this.lastETHPrice = 0;
        this.lastPriceCheckTime = new Date(0);
        this.priceChecks = 0;
        this.tradesExecuted = 0;
        this.totalProfit = 0;

        // Web3 setup - use native JsonRpcProvider for ethers.js
        this.provider = new ethers.providers.JsonRpcProvider(options.apiEndpoint, this.chainId);
        this.web3 = new Web3(new Web3.providers.HttpProvider(options.apiEndpoint));

        // Notification callback
        this.sendMessageToChat = options.sendMessageToChat || console.log;
        
        // Paper wallet setup (if paper trading enabled)
        if (this.paperTrading) {
            this.paperWallet = new PaperWallet(
                options.paperInitialETH || 1.0,
                options.paperInitialUSDC || 1000,
                options.paperStateFilePath
            );
        }

        // Dune Analytics setup for S/R calculation
        this.duneApiKey = options.duneApiKey || "";
        this.srMethod = options.srMethod || "simple";
        this.srRefreshHours = options.srRefreshHours || 48;
        this.srLookbackDays = options.srLookbackDays || 14;
        this.lastSRRefresh = null;
        this.supportResistance = null;

        if (this.duneApiKey) {
            this.duneApi = new DuneApi(this.duneApiKey, {
                method: this.srMethod,
                lookbackDays: this.srLookbackDays,
                refreshHours: this.srRefreshHours,
            });
            console.log(`📊 [S/R] Dune Analytics configured: ${this.srMethod} method, ${this.srLookbackDays}-day lookback, ${this.srRefreshHours}h refresh`);
        } else {
            this.duneApi = null;
            console.log("📊 [S/R] Dune API key not set - using fallback (current price as midpoint)");
        }

        // History store for frontend charting
        this.historyStore = getHistoryStore();
        console.log("📈 [HISTORY] History store initialized for frontend charting");

        // Initialize state
        this.loadState();
    }

    // ==================== State Management ====================

    loadState() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const data = fs.readFileSync(this.stateFilePath, "utf8");
                const state = JSON.parse(data);
                
                if (state.grid && Array.isArray(state.grid)) {
                    this.grid = state.grid.map(g => GridLevel.fromJSON(g));
                }
                this.tradesExecuted = state.tradesExecuted || 0;
                this.totalProfit = state.totalProfit || 0;
                this.basePrice = state.basePrice || this.basePrice;
                
                console.log(`Loaded state: ${this.grid.length} grid levels, ${this.tradesExecuted} trades`);
            }
        } catch (err) {
            console.error(`Failed to load state: ${err.message}`);
        }
    }

    saveState() {
        try {
            const state = {
                grid: this.grid.map(g => g.toJSON()),
                tradesExecuted: this.tradesExecuted,
                totalProfit: this.totalProfit,
                basePrice: this.basePrice,
                lastUpdate: Date.now(),
            };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
        } catch (err) {
            console.error(`Failed to save state: ${err.message}`);
        }
    }

    // ==================== Price Fetching ====================

    async fetchETHPrice() {
        try {
            // Using CoinGecko API to get ETH/USD price
            const response = await fetch(
                "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
            );
            const data = await response.json();
            const price = parseFloat(data.ethereum.usd);
            
            if (price < 100 || price > 100000) {
                throw new Error(`ETH price ${price} failed sanity check`);
            }
            
            this.lastETHPrice = price;
            
            // Record price for frontend charting
            this.historyStore.recordPrice(price);
            
            return price;
        } catch (err) {
            console.error(`Failed to fetch ETH price: ${err.message}`);
            return this.lastETHPrice || 0;
        }
    }

    // ==================== Balance Management ====================

    async fetchUSDCBalance() {
        // Paper trading mode - return virtual balance
        if (this.paperTrading) {
            const balance = this.paperWallet.usdcBalance;
            console.log(`📝 [PAPER] ${this.quoteTokenSymbol} balance: ${balance.toFixed(2)}`);
            return balance;
        }
        
        // Live trading mode - fetch from blockchain
        try {
            const contract = new this.web3.eth.Contract(ERC20_ABI, this.quoteTokenAddress);
            const balance = await contract.methods.balanceOf(this.walletAddress).call();
            return parseFloat(balance) / Math.pow(10, this.quoteTokenDecimals);
        } catch (err) {
            console.error(`Failed to fetch ${this.quoteTokenSymbol} balance: ${err.message}`);
            return 0;
        }
    }

    async fetchETHBalance() {
        // Paper trading mode - return virtual balance
        if (this.paperTrading) {
            const balance = this.paperWallet.ethBalance;
            console.log(`📝 [PAPER] ETH balance: ${balance.toFixed(6)}`);
            return balance;
        }
        
        // Live trading mode - fetch from blockchain
        try {
            const balance = await this.web3.eth.getBalance(this.walletAddress);
            return parseFloat(this.web3.utils.fromWei(balance, "ether"));
        } catch (err) {
            console.error(`Failed to fetch ETH balance: ${err.message}`);
            return 0;
        }
    }

    // ==================== Support/Resistance ====================

    /**
     * Fetch support/resistance levels from Dune Analytics
     * Falls back to current price if Dune is unavailable
     */
    async fetchSupportResistance() {
        if (!this.duneApi) {
            console.log("📊 [S/R] No Dune API - using current price as midpoint");
            const currentPrice = await this.fetchETHPrice();
            return createFallbackSR(currentPrice);
        }

        try {
            const sr = await this.duneApi.fetchSupportResistance();
            this.supportResistance = sr;
            this.lastSRRefresh = Date.now();
            return sr;
        } catch (err) {
            console.error(`📊 [S/R] Dune fetch failed: ${err.message}`);
            console.log("📊 [S/R] Falling back to current price as midpoint");
            
            const currentPrice = await this.fetchETHPrice();
            return createFallbackSR(currentPrice);
        }
    }

    /**
     * Check if S/R levels need to be refreshed
     */
    shouldRefreshSR() {
        if (!this.lastSRRefresh) return true;
        const ageMs = Date.now() - this.lastSRRefresh;
        const refreshMs = this.srRefreshHours * 60 * 60 * 1000;
        return ageMs >= refreshMs;
    }

    // ==================== Grid Management ====================

    async initializeGrid(currentPrice = null) {
        // Fetch S/R levels to determine the TRUE midpoint
        const sr = await this.fetchSupportResistance();
        
        // Use S/R midpoint instead of arbitrary current price
        const centerPrice = this.basePrice || sr.midpoint;
        this.basePrice = centerPrice;
        
        // Get current price for validation
        if (!currentPrice) {
            currentPrice = await this.fetchETHPrice();
        }

        if (!currentPrice || currentPrice <= 0) {
            throw new Error("Cannot initialize grid: invalid ETH price");
        }

        // Log S/R info
        this.sendMessageToChat(
            `📊 S/R Analysis (${sr.method}, ${sr.lookbackDays}d): Support $${sr.support.toFixed(2)} | Resistance $${sr.resistance.toFixed(2)} | Midpoint $${sr.midpoint.toFixed(2)}`,
            "info"
        );
        
        // Use strategy module to calculate grid levels
        this.grid = calculateGridLevels({
            centerPrice,
            levelCount: this.gridLevels,
            spacingPercent: this.gridSpacingPercent,
            amountPerGrid: this.amountPerGrid,
        });

        this.saveState();
        
        this.sendMessageToChat(
            util.format(
                "Grid initialized: %d levels from $%s to $%s, center at $%s",
                this.grid.length,
                this.grid[0].price.toFixed(2),
                this.grid[this.grid.length - 1].price.toFixed(2),
                centerPrice.toFixed(2)
            ),
            "grid"
        );
        
        return this.grid;
    }

    findTriggeredLevel(currentPrice) {
        // Delegate to strategy module
        return findTriggeredLevel(currentPrice, this.grid);
    }

    // ==================== Trading Execution ====================

    async executeTrade(level, currentPrice) {
        if (level.side === "buy") {
            return await this.executeBuy(level, currentPrice);
        } else {
            return await this.executeSell(level, currentPrice);
        }
    }

    // Calculate random slippage for paper trading (0 to max%)
    calculatePaperSlippage() {
        return Math.random() * this.paperSlippagePercent / 100;
    }

    // Estimate gas cost in ETH for paper trading
    async estimatePaperGasCost() {
        if (!this.paperSimulateGas) return 0;
        try {
            const gasPrice = await this.web3.eth.getGasPrice();
            const gasPriceWithMultiplier = parseInt(gasPrice) * this.gasMultiplier;
            const gasCostWei = gasPriceWithMultiplier * this.gasLimit;
            return parseFloat(this.web3.utils.fromWei(gasCostWei.toString(), "ether"));
        } catch (err) {
            console.error("📝 [PAPER] Failed to estimate gas, using default:", err.message);
            return 0.005; // Default fallback ~0.005 ETH
        }
    }

    async executeBuy(level, currentPrice) {
        // Buy ETH with USDC
        const ethAmount = level.quantity;
        const usdcAmount = ethAmount * currentPrice; // USDC needed
        const prefix = this.paperTrading ? "📝 [PAPER] " : "";
        
        this.sendMessageToChat(
            util.format(
                "%sExecuting BUY at grid level %d: ~%s ETH for ~%s %s (@ $%s/ETH)",
                prefix,
                level.index,
                ethAmount.toFixed(6),
                usdcAmount.toFixed(2),
                this.quoteTokenSymbol,
                currentPrice.toFixed(2)
            ),
            "buy"
        );

        try {
            let result;
            
            if (this.paperTrading) {
                // Paper trading: simulate the trade
                const slippage = this.calculatePaperSlippage();
                const actualETHReceived = ethAmount * (1 - slippage);
                const gasCost = await this.estimatePaperGasCost();
                
                // Check sufficient USDC balance
                if (this.paperWallet.usdcBalance < usdcAmount) {
                    throw new Error(`Insufficient ${this.quoteTokenSymbol}: have ${this.paperWallet.usdcBalance.toFixed(2)}, need ${usdcAmount.toFixed(2)}`);
                }
                
                // Execute paper trade: spend USDC, receive ETH
                this.paperWallet.executeBuy(usdcAmount, actualETHReceived);
                this.paperWallet.deductGas(gasCost);
                
                // Record trade in paper wallet
                const trade = this.paperWallet.recordTrade({
                    side: "buy",
                    gridLevel: level.index,
                    triggerPrice: level.price,
                    executionPrice: currentPrice,
                    ethReceived: actualETHReceived,
                    usdcSpent: usdcAmount,
                    slippagePercent: slippage * 100,
                    gasCost: gasCost,
                });
                
                console.log(`📝 [PAPER] BUY executed: ${actualETHReceived.toFixed(6)} ETH for ${usdcAmount.toFixed(2)} ${this.quoteTokenSymbol} (slippage: ${(slippage * 100).toFixed(3)}%, gas: ${gasCost.toFixed(6)} ETH)`);
                
                // Simulate result
                result = await this.swapUSDCForETH(usdcAmount, ethAmount);
                result.paperTrade = trade;
            } else {
                // Live trading: execute real swap
                result = await this.swapUSDCForETH(usdcAmount, ethAmount);
            }
            
            level.filled = true;
            level.filledAt = Date.now();
            level.txHash = result.transactionHash;
            
            this.tradesExecuted++;
            this.saveState();
            
            // Record trade for frontend charting
            this.historyStore.recordTrade({
                timestamp: Date.now(),
                side: "buy",
                price: currentPrice,
                quantity: ethAmount,
                gridLevel: level.index,
                usdValue: usdcAmount,
            });
            
            // Reset opposite level for potential reverse trade
            this.maybeCreateOppositeLevel(level);
            
            return result;
        } catch (err) {
            this.sendMessageToChat(`${prefix}BUY failed: ${err.message}`, "error");
            throw err;
        }
    }

    async executeSell(level, currentPrice) {
        // Sell ETH for USDC
        const ethAmount = level.quantity;
        const expectedUSDC = ethAmount * currentPrice;
        const prefix = this.paperTrading ? "📝 [PAPER] " : "";
        
        this.sendMessageToChat(
            util.format(
                "%sExecuting SELL at grid level %d: ~%s ETH for ~%s %s (@ $%s/ETH)",
                prefix,
                level.index,
                ethAmount.toFixed(6),
                expectedUSDC.toFixed(2),
                this.quoteTokenSymbol,
                currentPrice.toFixed(2)
            ),
            "sell"
        );

        try {
            let result;
            
            if (this.paperTrading) {
                // Paper trading: simulate the trade
                const slippage = this.calculatePaperSlippage();
                const actualUSDCReceived = expectedUSDC * (1 - slippage);
                const gasCost = await this.estimatePaperGasCost();
                
                // Check sufficient ETH balance (including gas)
                if (this.paperWallet.ethBalance < ethAmount + gasCost) {
                    throw new Error(`Insufficient ETH: have ${this.paperWallet.ethBalance.toFixed(6)}, need ${(ethAmount + gasCost).toFixed(6)}`);
                }
                
                // Execute paper trade: spend ETH, receive USDC
                this.paperWallet.executeSell(ethAmount, actualUSDCReceived);
                this.paperWallet.deductGas(gasCost);
                
                // Record trade in paper wallet
                const trade = this.paperWallet.recordTrade({
                    side: "sell",
                    gridLevel: level.index,
                    triggerPrice: level.price,
                    executionPrice: currentPrice,
                    ethSold: ethAmount,
                    usdcReceived: actualUSDCReceived,
                    slippagePercent: slippage * 100,
                    gasCost: gasCost,
                });
                
                console.log(`📝 [PAPER] SELL executed: ${ethAmount.toFixed(6)} ETH for ${actualUSDCReceived.toFixed(2)} ${this.quoteTokenSymbol} (slippage: ${(slippage * 100).toFixed(3)}%, gas: ${gasCost.toFixed(6)} ETH)`);
                
                // Simulate result
                result = await this.swapETHForUSDC(ethAmount);
                result.paperTrade = trade;
            } else {
                // Live trading: execute real swap
                result = await this.swapETHForUSDC(ethAmount);
            }
            
            level.filled = true;
            level.filledAt = Date.now();
            level.txHash = result.transactionHash;
            
            this.tradesExecuted++;
            this.saveState();
            
            // Record trade for frontend charting
            this.historyStore.recordTrade({
                timestamp: Date.now(),
                side: "sell",
                price: currentPrice,
                quantity: ethAmount,
                gridLevel: level.index,
                usdValue: expectedUSDC,
            });
            
            // Reset opposite level for potential reverse trade
            this.maybeCreateOppositeLevel(level);
            
            return result;
        } catch (err) {
            this.sendMessageToChat(`${prefix}SELL failed: ${err.message}`, "error");
            throw err;
        }
    }

    maybeCreateOppositeLevel(filledLevel) {
        // Use strategy module to get opposite level index
        const oppositeIndex = getOppositeLevelIndex(filledLevel, this.grid.length);
        
        if (oppositeIndex !== null) {
            const adjacentLevel = this.grid[oppositeIndex];
            if (adjacentLevel.filled) {
                adjacentLevel.filled = false;
                adjacentLevel.filledAt = null;
                adjacentLevel.txHash = null;
                this.saveState();
                
                console.log(`Reset grid level ${oppositeIndex} for opposite trade`);
            }
        }
    }

    // ==================== Uniswap Interactions ====================

    decimalize(amount, decimals) {
        return JSBI.BigInt(Math.floor(amount * Math.pow(10, decimals)));
    }

    // Swap USDC for ETH (buying ETH)
    async swapUSDCForETH(usdcAmount, minETHOut) {
        // First ensure USDC allowance
        await this.ensureAllowance(usdcAmount);
        
        const path = [this.quoteToken.address, WETH[this.chainId].address];
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        
        const txCount = await this.web3.eth.getTransactionCount(this.walletAddress);
        const nonce = this.web3.utils.toHex(txCount);
        
        const router = new this.web3.eth.Contract(
            IUniswapV2Router02.abi,
            config.UNISWAP_ROUTER_ADDRESS
        );
        
        const usdcWei = this.decimalize(usdcAmount, this.quoteTokenDecimals);
        const minETHWei = this.web3.utils.toWei(
            (minETHOut * (1 - this.slippageTolerance / 100)).toString(), 
            "ether"
        );
        
        const swap = router.methods.swapExactTokensForETH(
            "0x" + usdcWei.toString(16),
            minETHWei,
            path,
            this.walletAddress,
            deadline
        );
        
        const data = swap.encodeABI();
        const gasPrice = await this.getGasPrice();
        
        const txo = {
            to: config.UNISWAP_ROUTER_ADDRESS,
            nonce: nonce,
            from: this.walletAddress,
            value: "0x00",
            data: data,
            gasPrice: this.web3.utils.toHex(gasPrice),
            gasLimit: this.web3.utils.toHex(this.gasLimit),
        };
        
        return await this.signAndSend(txo);
    }

    // Swap ETH for USDC (selling ETH)
    async swapETHForUSDC(ethAmount) {
        const path = [WETH[this.chainId].address, this.quoteToken.address];
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        
        const txCount = await this.web3.eth.getTransactionCount(this.walletAddress);
        const nonce = this.web3.utils.toHex(txCount);
        
        const router = new this.web3.eth.Contract(
            IUniswapV2Router02.abi,
            config.UNISWAP_ROUTER_ADDRESS
        );
        
        const ethWei = this.web3.utils.toWei(ethAmount.toString(), "ether");
        
        const swap = router.methods.swapExactETHForTokens(
            "0x0", // Accept any amount (slippage handled by deadline)
            path,
            this.walletAddress,
            deadline
        );
        
        const data = swap.encodeABI();
        const gasPrice = await this.getGasPrice();
        
        const txo = {
            to: config.UNISWAP_ROUTER_ADDRESS,
            nonce: nonce,
            from: this.walletAddress,
            value: this.web3.utils.toHex(ethWei),
            data: data,
            gasPrice: this.web3.utils.toHex(gasPrice),
            gasLimit: this.web3.utils.toHex(this.gasLimit),
        };
        
        return await this.signAndSend(txo);
    }

    async ensureAllowance(usdcAmount) {
        const contract = new this.web3.eth.Contract(ERC20_ABI, this.quoteTokenAddress);
        const allowance = await contract.methods
            .allowance(this.walletAddress, config.UNISWAP_ROUTER_ADDRESS)
            .call();
        
        const requiredAllowance = this.decimalize(usdcAmount * 2, this.quoteTokenDecimals);
        
        if (BigInt(allowance) < BigInt(requiredAllowance.toString())) {
            console.log(`Setting ${this.quoteTokenSymbol} allowance...`);
            
            const maxUint256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
            const approve = contract.methods.approve(config.UNISWAP_ROUTER_ADDRESS, maxUint256);
            
            const txCount = await this.web3.eth.getTransactionCount(this.walletAddress);
            const gasPrice = await this.getGasPrice();
            
            const txo = {
                to: this.quoteTokenAddress,
                nonce: this.web3.utils.toHex(txCount),
                from: this.walletAddress,
                value: "0x00",
                data: approve.encodeABI(),
                gasPrice: this.web3.utils.toHex(gasPrice),
                gasLimit: this.web3.utils.toHex(100000),
            };
            
            await this.signAndSend(txo);
            console.log("Allowance set successfully");
        }
    }

    async getGasPrice() {
        const networkGasPrice = await this.web3.eth.getGasPrice();
        return Math.floor(parseInt(networkGasPrice) * this.gasMultiplier);
    }

    async signAndSend(txo) {
        // Paper trading mode - simulate transaction via eth_call
        if (this.paperTrading) {
            console.log("📝 [PAPER] Simulating transaction via eth_call...");
            try {
                const simulationResult = await this.web3.eth.call({
                    to: txo.to,
                    from: txo.from,
                    data: txo.data,
                    value: txo.value,
                });
                console.log("📝 [PAPER] Simulation successful!");
                
                // Generate a fake transaction hash for tracking
                const fakeTxHash = "0xPAPER_" + Date.now().toString(16) + "_" + Math.random().toString(16).slice(2, 10);
                
                this.sendMessageToChat(
                    `📝 [PAPER] Simulated TX: ${fakeTxHash.slice(0, 24)}...`,
                    "info"
                );
                
                return {
                    transactionHash: fakeTxHash,
                    simulated: true,
                    simulationResult: simulationResult,
                };
            } catch (err) {
                console.error("📝 [PAPER] Simulation FAILED:", err.message);
                this.sendMessageToChat(
                    `📝 [PAPER] Simulation failed: ${err.message}`,
                    "error"
                );
                throw err;
            }
        }
        
        // Live trading mode - sign and broadcast real transaction
        const tx = new EthTx(txo, { chain: "mainnet", hardfork: "istanbul" });
        tx.sign(this.privateKey);
        
        const serializedTx = "0x" + tx.serialize().toString("hex");
        
        this.sendMessageToChat(
            `Broadcasting TX: ${tx.hash().toString("hex").slice(0, 16)}...`,
            "info"
        );
        
        const result = await this.web3.eth.sendSignedTransaction(serializedTx);
        
        this.sendMessageToChat(
            `TX confirmed: ${EXPLORER_TX_PREFIX}${result.transactionHash}`,
            "success"
        );
        
        return result;
    }

    // ==================== Grid Display ====================

    printGridLevels() {
        // Delegate to strategy module for display formatting
        const display = formatGridDisplay(this.grid, this.basePrice, this.amountPerGrid);
        console.log("\n" + display + "\n");
    }

    // ==================== Main Loop ====================

    async run() {
        this.running = true;
        
        this.sendMessageToChat(
            util.format(
                "Starting ETH grid trader with %d levels, %s%% spacing",
                this.gridLevels,
                this.gridSpacingPercent
            ),
            "startup"
        );
        
        // Initialize grid if not loaded from state
        if (this.grid.length === 0) {
            await this.initializeGrid();
        }
        
        // Print grid levels
        this.printGridLevels();
        
        while (this.running) {
            try {
                await this.tick();
            } catch (err) {
                console.error(`Tick error: ${err.message}`);
                this.sendMessageToChat(`Error: ${err.message}`, "error");
            }
            
            await sleepSeconds(this.priceCheckIntervalSeconds);
        }
        
        this.sendMessageToChat("Grid trader shutting down", "shutdown");
    }

    async tick() {
        this.priceChecks++;
        
        const currentPrice = await this.fetchETHPrice();
        
        if (!currentPrice || currentPrice <= 0) {
            console.log("Could not fetch ETH price, skipping tick");
            return;
        }
        
        // Find triggered grid level
        const triggeredLevel = this.findTriggeredLevel(currentPrice);
        
        if (triggeredLevel) {
            console.log(
                `Grid level ${triggeredLevel.index} triggered: ${triggeredLevel.side} ETH at $${triggeredLevel.price.toFixed(2)}`
            );
            
            try {
                await this.executeTrade(triggeredLevel, currentPrice);
                await sleepSeconds(this.postTradeCooldownSeconds);
            } catch (err) {
                console.error(`Trade execution failed: ${err.message}`);
            }
        }
        
        // Periodic status report
        await this.maybeReportStatus(currentPrice);
    }

    async maybeReportStatus(currentPrice) {
        const timeSinceReport = Date.now() - this.lastStatusReportTime;
        const reportIntervalMs = this.statusReportIntervalMinutes * 60 * 1000;
        
        if (timeSinceReport < reportIntervalMs) return;
        
        const usdcBalance = await this.fetchUSDCBalance();
        const ethBalance = await this.fetchETHBalance();
        
        const filledBuys = this.grid.filter(l => l.side === "buy" && l.filled).length;
        const filledSells = this.grid.filter(l => l.side === "sell" && l.filled).length;
        const pendingBuys = this.grid.filter(l => l.side === "buy" && !l.filled).length;
        const pendingSells = this.grid.filter(l => l.side === "sell" && !l.filled).length;
        
        const prefix = this.paperTrading ? "📝 [PAPER] " : "";
        
        this.sendMessageToChat(
            util.format(
                "%sStatus: ETH @ $%s | ETH: %s ($%s) | %s: %s | " +
                "Grid: %d/%d buys, %d/%d sells | Checks: %d | Trades: %d",
                prefix,
                currentPrice.toFixed(2),
                ethBalance.toFixed(4),
                (ethBalance * currentPrice).toFixed(2),
                this.quoteTokenSymbol,
                usdcBalance.toFixed(2),
                filledBuys,
                filledBuys + pendingBuys,
                filledSells,
                filledSells + pendingSells,
                this.priceChecks,
                this.tradesExecuted
            ),
            "info"
        );
        
        // Paper trading: also report P&L metrics
        if (this.paperTrading) {
            const stats = this.paperWallet.getStats(currentPrice);
            const pnlSign = stats.unrealizedPnL >= 0 ? "+" : "";
            
            this.sendMessageToChat(
                util.format(
                    "📊 [PAPER P&L] Initial: $%s → Current: $%s | P&L: %s$%s (%s%s%%) | " +
                    "Gas spent: %s ETH ($%s) | Running: %sh",
                    stats.initialValueUSD.toFixed(2),
                    stats.currentValueUSD.toFixed(2),
                    pnlSign,
                    Math.abs(stats.unrealizedPnL).toFixed(2),
                    pnlSign,
                    stats.unrealizedPnLPercent.toFixed(2),
                    stats.totalGasSpent.toFixed(6),
                    stats.gasSpentUSD.toFixed(2),
                    stats.runningTimeHours.toFixed(1)
                ),
                "info"
            );
        }
        
        this.lastStatusReportTime = Date.now();
    }

    shutdown() {
        this.running = false;
        // Flush any pending history data
        this.historyStore.flush();
        console.log("📈 [HISTORY] Final flush completed");
    }

    // ==================== Utility Methods ====================

    getGridSummary() {
        // Use strategy module for grid stats
        const stats = getGridStats(this.grid);
        return {
            ...stats,
            basePrice: this.basePrice,
            tradesExecuted: this.tradesExecuted,
            totalProfit: this.totalProfit,
        };
    }

    printGrid() {
        console.log("\n=== ETH Grid Status ===");
        console.log(`Base Price: $${this.basePrice?.toFixed(2) || "N/A"}`);
        console.log(`Current Price: $${this.lastETHPrice?.toFixed(2) || "N/A"}`);
        console.log("");
        
        for (const level of this.grid) {
            const status = level.filled ? "✓" : "○";
            const arrow = level.side === "buy" ? "↓" : "↑";
            console.log(
                `  ${status} [${level.index}] ${arrow} ${level.side.toUpperCase().padEnd(4)} @ $${level.price.toFixed(2)} (${level.quantity.toFixed(6)} ETH)`
            );
        }
        
        console.log("===================\n");
    }
}

// Re-export GridLevel from strategy module for external use
export { TrahnGridTradingBot, PaperWallet, GridLevel };
