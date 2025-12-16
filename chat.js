#!/usr/bin/env node

import got from "got";

/**
 * Creates a chat notification sender function
 * Supports Slack, Discord, and generic webhooks
 * 
 * @param {string} webhookURL - The webhook URL to send messages to
 * @param {string} botName - The name to display for the bot
 * @returns {Function} - Async function to send messages
 */
function getChatSender(webhookURL, botName) {
    return async (msg, level = "info") => {
        const timestamp = new Date().toISOString();
        const emoji = getEmoji(level);
        const formattedMsg = `${emoji} [${botName}] ${msg}`;
        
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
    const emojis = {
        info: "ℹ️",
        success: "✅",
        warning: "⚠️",
        error: "❌",
        trade: "💰",
        buy: "🟢",
        sell: "🔴",
        grid: "📊",
        startup: "🚀",
        shutdown: "🛑",
    };
    return emojis[level] || "📌";
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

export { getChatSender };

