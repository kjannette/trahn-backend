#!/usr/bin/env node

/**
 * Promisified sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for a number of seconds
 * @param {number} seconds
 * @returns {Promise<void>}
 */
function sleepSeconds(seconds) {
    return sleep(seconds * 1000);
}

/**
 * Sleep for a number of minutes
 * @param {number} minutes
 * @returns {Promise<void>}
 */
function sleepMinutes(minutes) {
    return sleep(minutes * 60 * 1000);
}

export { sleep, sleepSeconds, sleepMinutes };

