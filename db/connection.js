#!/usr/bin/env node

/**
 * PostgreSQL Database Connection
 * 
 * Manages connection pool and provides database access
 */

import pg from "pg";
const { Pool } = pg;

let pool = null;

/**
 * Database configuration from environment
 */
const DB_CONFIG = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "trahn_grid_trader",
    user: "kjannette",
    password: process.env.DB_PASSWORD || "",
    
    // Connection pool settings
    max: 20,                    // Max connections
    idleTimeoutMillis: 30000,   // Close idle clients after 30s
    connectionTimeoutMillis: 2000, // Return error after 2s if can't connect
};

/**
 * Get or create database connection pool
 */
export function getPool() {
    if (!pool) {
        pool = new Pool(DB_CONFIG);
        
        // Handle pool errors
        pool.on("error", (err) => {
            console.error("Unexpected database pool error:", err);
        });
        
        console.log(`[DB] PostgreSQL connection pool created (${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database})`);
    }
    return pool;
}

/**
 * Test database connection
 */
export async function testConnection() {
    try {
        const pool = getPool();
        const result = await pool.query("SELECT NOW() as time");
        console.log(`[DB] Connection successful at ${result.rows[0].time}`);
        return true;
    } catch (err) {
        console.error(`[DB] Connection failed: ${err.message}`);
        return false;
    }
}

/**
 * Execute a query with parameters
 */
export async function query(text, params = []) {
    const pool = getPool();
    return await pool.query(text, params);
}

/**
 * Close all database connections
 */
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log("[DB] Connection pool closed");
    }
}

