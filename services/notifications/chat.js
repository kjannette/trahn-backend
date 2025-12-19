#!/usr/bin/env node

import got from "got";

/**
 * Notification Service Configuration
 */

// Notification Configuration (not secrets - these are service settings)
export const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
export const BOT_NAME = "TrahnGridTrader";

/**
 * Creates a chat notification sender function
 * Supports Slack, Discord, and generic webhooks
 * 
 * @param {string} webhookURL - The webhook URL to send messages to (optional, uses WEBHOOK_URL constant if not provided)
 * @param {string} botName - The name to display for the bot (optional, uses BOT_NAME constant if not provided)
 * @returns {Function} - Async function to send messages
 */
export function getChatSender(webhookURL = WEBHOOK_URL, botName = BOT_NAME) {
    return async (msg, level = "info") => {
        const timestamp = new Date().toISOString();
        const formattedMsg = `[${botName}] ${msg}`;
        
        console.log(`[${timestamp}] ${formattedMsg}`);
        
        if (!webhookURL) {
            return;
        }
        
        try {
            // Detect webhook type and format accordingly
            const payload = formatPayload(webhookURL, formattedMsg, botName);
            const resp = await got.post(webhookURL, {
                json: payload,
                timeout: { request: 10000 },
            });
            return resp;
        } catch (err) {
            console.error(`[CHAT ERROR] Failed to send notification: ${err.message}`);
        }
    };
}

/**
 * Get emoji based on log level
 */
function getEmoji(level) {
    // Emojis removed per user request
    return "";
}

/**
 * Format payload based on webhook type (Slack vs Discord)
 */
function formatPayload(webhookURL, msg, botName) {
    if (webhookURL.includes("discord")) {
        return {
            content: msg,
            username: botName,
        };
    }
    // Default to Slack format
    return {
        text: `\`${msg}\``,
        username: botName,
    };
}

