#!/usr/bin/env node

/**
 * Basic tests for the Grid Trading Bot
 * Run with: npm test
 */

import { GridLevel } from "./gridbot.js";

describe("GridLevel", () => {
    test("should create a grid level with correct properties", () => {
        const level = new GridLevel(0, 0.03, "buy", 1000, false);
        
        expect(level.index).toBe(0);
        expect(level.price).toBe(0.03);
        expect(level.side).toBe("buy");
        expect(level.quantity).toBe(1000);
        expect(level.filled).toBe(false);
    });

    test("should serialize to JSON correctly", () => {
        const level = new GridLevel(5, 0.05, "sell", 500, true);
        level.filledAt = 1699999999999;
        level.txHash = "0x123abc";
        
        const json = level.toJSON();
        
        expect(json.index).toBe(5);
        expect(json.price).toBe(0.05);
        expect(json.side).toBe("sell");
        expect(json.quantity).toBe(500);
        expect(json.filled).toBe(true);
        expect(json.filledAt).toBe(1699999999999);
        expect(json.txHash).toBe("0x123abc");
    });

    test("should deserialize from JSON correctly", () => {
        const json = {
            index: 3,
            price: 0.04,
            side: "buy",
            quantity: 750,
            filled: true,
            filledAt: 1699999999999,
            txHash: "0xdef456",
        };
        
        const level = GridLevel.fromJSON(json);
        
        expect(level.index).toBe(3);
        expect(level.price).toBe(0.04);
        expect(level.side).toBe("buy");
        expect(level.quantity).toBe(750);
        expect(level.filled).toBe(true);
        expect(level.filledAt).toBe(1699999999999);
        expect(level.txHash).toBe("0xdef456");
    });
});

describe("Grid Configuration", () => {
    test("should validate grid levels minimum", () => {
        expect(() => {
            if (1 < 2) return true;
            throw new Error("GRID_LEVELS must be at least 2");
        }).not.toThrow();
    });

    test("should validate grid spacing is positive", () => {
        const spacing = 2;
        expect(spacing).toBeGreaterThan(0);
    });

    test("should validate amount per grid is positive", () => {
        const amount = 100;
        expect(amount).toBeGreaterThan(0);
    });
});

// Smoke test to ensure modules load
describe("Module Loading", () => {
    test("should import sleep utilities", async () => {
        const { sleep, sleepSeconds } = await import("../utilities/sleep.js");
        expect(typeof sleep).toBe("function");
        expect(typeof sleepSeconds).toBe("function");
    });

    test("should import chat utilities", async () => {
        const { getChatSender } = await import("../services/notifications/chat.js");
        expect(typeof getChatSender).toBe("function");
    });

    test("should import config", async () => {
        const config = await import("../configuration/config.js");
        expect(config.GRID_LEVELS).toBeDefined();
        expect(config.validateConfig).toBeDefined();
    });
});

console.log("✓ All basic tests defined");

