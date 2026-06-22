// Debug console elements
const debugConsole = document.getElementById('debug-console');
const lastUpdated = document.getElementById('last-updated');

// Enhanced logging system. For now will use the default location.
const logManager = {
    logDir: '/data/adb/vr25/acc-data/logs',
    logFile: '/data/adb/vr25/acc-data/logs/webview-acc.log',
    maxLogLines: 500,
    logLevel: 'DEBUG',

    ensureLogDirectory: async function() {
        try {
            await this.executeCommand(`mkdir -p "${this.logDir}" && chmod 755 "${this.logDir}"`);
            await this.info(`Log directory ensured at ${this.logDir}`);
            return true;
        } catch (e) {
            console.error(`Failed to create log directory: ${e}`);
            return false;
        }
    },

    executeCommand: async function(command) {
        return new Promise((resolve, reject) => {
            if (typeof ksu !== 'undefined' && ksu.exec) {
                const callback = `log_callback_${Date.now()}`;
                window[callback] = function(errno, stdout, stderr) {
                    delete window[callback];
                    if (errno === 0) {
                        resolve(stdout);
                    } else {
                        reject(stderr || `Command failed with error ${errno}`);
                    }
                };
                ksu.exec(command, callback);
            } else {
                reject("KernelSU API not available");
            }
        });
    },

    writeLogInternal: async function(level, message) {
        if (this.shouldLog(level)) {
            try {
                const timestamp = new Date().toISOString();
                const logEntry = `[${timestamp}] [${level}] ${message}`;
                await this.executeCommand(`echo '${logEntry.replace(/'/g, "'\\''")}' >> "${this.logFile}"`);
                return true;
            } catch (e) {
                console.error(`Failed to write log: ${e}`);
                return false;
            }
        }
        return false;
    },

    shouldLog: function(level) {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    },

    debug: function(message) { return this.writeLogInternal('DEBUG', message); },
    info: function(message) { return this.writeLogInternal('INFO', message); },
    warn: function(message) { return this.writeLogInternal('WARN', message); },
    error: function(message) { return this.writeLogInternal('ERROR', message); },

    readLogs: async function() {
        try {
            if (!(await this.ensureLogDirectory())) return "Log directory not accessible";

            const fileExists = await this.executeCommand(`[ -f "${this.logFile}" ] && echo "exists"`)
                .then(output => output.includes('exists'))
                .catch(() => false);

            if (!fileExists) {
                await this.executeCommand(`touch "${this.logFile}" && chmod 644 "${this.logFile}"`);
                return "New log file created";
            }

            let logs = await this.executeCommand(`cat "${this.logFile}"`);
            const lineCount = logs.split('\n').filter(line => line.trim()).length;

            if (lineCount > this.maxLogLines) {
                await this.rotateLogs();
                logs = await this.executeCommand(`cat "${this.logFile}"`);
            }

            return logs || "No logs available";
        } catch (e) {
            return `Error reading logs: ${e}`;
        }
    },

    rotateLogs: async function() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedFile = `${this.logFile}.${timestamp}`;
            await this.executeCommand(`mv "${this.logFile}" "${rotatedFile}" && touch "${this.logFile}" && chmod 644 "${this.logFile}"`);
            await this.info(`Logs rotated to ${rotatedFile}`);
            return true;
        } catch (e) {
            await this.error(`Log rotation failed: ${e}`);
            return false;
        }
    },

    clearLogs: async function() {
        try {
            await this.executeCommand(`echo "" > "${this.logFile}"`);
            await this.info("Logs cleared");
            return true;
        } catch (e) {
            await this.error(`Failed to clear logs: ${e}`);
            return false;
        }
    },

    getRecentLogs: async function(lines = 100) {
        try {
            const logs = await this.executeCommand(`tail -n ${lines} "${this.logFile}"`);
            return logs || "No recent logs available";
        } catch (e) {
            return `Error getting recent logs: ${e}`;
        }
    }
};

function debugLog(message, level = 'DEBUG') {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;

    debugConsole.textContent += `${logMessage}\n`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
    lastUpdated.textContent = new Date().toLocaleString();

    switch(level) {
        case 'ERROR': logManager.error(message); break;
        case 'WARN': logManager.warn(message); break;
        case 'INFO': logManager.info(message); break;
        default: logManager.debug(message);
    }
}

const commandExecutor = {
    exec: function(command, args = [], timeout = 10000) {
        return new Promise((resolve, reject) => {
            debugLog(`Executing: ${command} ${args.join(' ')}`, 'DEBUG');

            if (typeof ksu !== 'undefined' && ksu.exec) {
                const callback = `cmd_callback_${Date.now()}`;
                let timedOut = false;
                const timer = setTimeout(() => {
                    timedOut = true;
                    delete window[callback];
                    reject(`Command timed out after ${timeout}ms`);
                }, timeout);

                window[callback] = function(errno, stdout, stderr) {
                    if (timedOut) return;
                    clearTimeout(timer);
                    delete window[callback];

                    if (errno === 0) {
                        resolve(stdout);
                    } else {
                        reject(stderr || `Command failed with error ${errno}`);
                    }
                };

                const fullCmd = [command, ...args].map(arg =>
                    arg.includes(' ') ? `"${arg.replace(/"/g, '\\"')}"` : arg
                ).join(' ');

                try {
                    ksu.exec(fullCmd, callback);
                } catch (e) {
                    clearTimeout(timer);
                    reject(`Execution error: ${e}`);
                }
            } else {
                reject("KernelSU API not available");
            }
        });
    },

    // Like exec, but never rejects on non-zero exit; returns {errno, stdout, stderr}.
    // Use for tools that signal meaningful states via exit codes (e.g. acc -u returns 6 = no update).
    execRaw: function(command, args = [], timeout = 10000) {
        return new Promise((resolve, reject) => {
            debugLog(`Executing (raw): ${command} ${args.join(' ')}`, 'DEBUG');

            if (typeof ksu !== 'undefined' && ksu.exec) {
                const callback = `cmd_raw_${Date.now()}`;
                let timedOut = false;
                const timer = setTimeout(() => {
                    timedOut = true;
                    delete window[callback];
                    reject(`Command timed out after ${timeout}ms`);
                }, timeout);

                window[callback] = function(errno, stdout, stderr) {
                    if (timedOut) return;
                    clearTimeout(timer);
                    delete window[callback];
                    resolve({ errno: errno, stdout: stdout || '', stderr: stderr || '' });
                };

                const fullCmd = [command, ...args].map(arg =>
                    arg.includes(' ') ? `"${arg.replace(/"/g, '\\"')}"` : arg
                ).join(' ');

                try {
                    ksu.exec(fullCmd, callback);
                } catch (e) {
                    clearTimeout(timer);
                    reject(`Execution error: ${e}`);
                }
            } else {
                reject("KernelSU API not available");
            }
        });
    }
};

function showError(message, type = 'error') {
    const errorBox = document.getElementById('error-display');
    errorBox.textContent = message;
    errorBox.className = `error-box ${type}`;
    errorBox.style.display = 'block';
    debugLog(`${type.toUpperCase()}: ${message}`, 'INFO');
    setTimeout(hideError, 5000);
}

function hideError() {
    document.getElementById('error-display').style.display = 'none';
}

function setButtonLoading(button, loading = true) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

function updateStatusClass(element, value) {
    if (!element) return;
    element.classList.remove('status-good', 'status-bad');
    const val = value.toString().toLowerCase();
    if (val.includes('running') || val.includes('ok') || val.includes('charging') || val.includes('uid=0')) {
        element.classList.add('status-good');
    } else if (val.includes('error') || val.includes('failed') || val.includes('not') || val.includes('stop')) {
        element.classList.add('status-bad');
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

let globalAccPath = null;

async function updateStatus() {
    if (!globalAccPath && window.ACC && window.ACC.accPath) globalAccPath = window.ACC.accPath;
    if (!globalAccPath) {
        debugLog("ACC path not available for status update", 'ERROR');
        return;
    }

    try {
        const output = await commandExecutor.exec(globalAccPath, ['-i']);
        debugLog(`Raw acc -i output:\n${output}`, 'DEBUG');

        const lines = (output || '').split('\n').filter(line => line.trim());
        const status = {};
        
        // Parse battery info output more reliably
        lines.forEach(line => {
            // Try colon/equals separator first (key: value or key=value)
            let m = line.match(/^\s*([a-zA-Z0-9_\-]+)\s*[:=]\s*(.+)$/);
            if (m) {
                status[m[1]] = m[2].trim();
                return;
            }

            // Fallback to space separator (key value)
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                status[parts[0]] = parts.slice(1).join(' ');
            }
        });

        // Update daemon status
        document.getElementById('daemon-status').textContent = 'Running';
        
        // Battery level - extract from "level 75%" format or raw number
        let batteryLevel = '0';
        if (status.level) {
            batteryLevel = status.level.toString().replace('%', '').replace(/[^0-9]/g, '');
        } else if (status.capacity) {
            batteryLevel = status.capacity.toString().replace('%', '').replace(/[^0-9]/g, '');
        }
        
        document.getElementById('battery-level').textContent = batteryLevel + '%';
        const batteryBar = document.getElementById('battery-bar');
        if (batteryBar) {
            batteryBar.style.setProperty('--battery-level', batteryLevel + '%');
        }
        
        // Charging status
        document.getElementById('charging-status').textContent = status.status || '-';
        
        // Current - handle "1.23A" format
        const currentNow = status.current_now || '-';
        document.getElementById('current-limit').textContent = currentNow;

        // Temperature - normalize "28℃" (U+2103 single glyph) to "28°C" for consistent rendering
        const tempElement = document.getElementById('temperature');
        if (tempElement) {
            let t = status.temp || '-';
            t = t.replace(/\u2103/g, '\u00B0C').replace(/\u2109/g, '\u00B0F');
            tempElement.textContent = t;
        }

        // Power - handle "5.35W" format
        const powerElement = document.getElementById('power-display');
        if (powerElement) {
            powerElement.textContent = status.power_now || '-';
        }

        // Charge type (optional - only when power supply connected)
        const chargeTypeElement = document.getElementById('charge-type');
        if (chargeTypeElement) {
            chargeTypeElement.textContent = status.charge_type || 'N/A';
        }

        // Real level (optional - only when capacity_mask enabled)
        const realLevelElement = document.getElementById('real-level');
        if (realLevelElement) {
            realLevelElement.textContent = status.real_level || 'N/A';
        }

        updateStatusClass(document.getElementById('daemon-status'), 'Running');
        updateStatusClass(document.getElementById('charging-status'), document.getElementById('charging-status').textContent);

        hideError();
        await logManager.info("Status refreshed");
    } catch (e) {
        showError(`Status load failed: ${e}`, 'error');
        document.getElementById('daemon-status').textContent = 'Error';
        updateStatusClass(document.getElementById('daemon-status'), 'Error');
        await logManager.error(`Status error: ${e}`);
    }
}

async function verifySystem() {
    console.log("Starting system verification...");
    
    // Show loading state immediately
    document.getElementById('root-status').textContent = 'Checking...';
    document.getElementById('acc-install-status').textContent = 'Checking...';
    
    try {
        console.log("Checking root access...");
        const idResult = await commandExecutor.exec('id');
        console.log("Root check result:", idResult);
        document.getElementById('root-status').textContent =
            idResult.includes('uid=0') ? 'Root access OK' : 'Root access failed';
        updateStatusClass(document.getElementById('root-status'), idResult);

        if (!idResult.includes('uid=0')) {
            hideLoadingOverlay();
            throw new Error("Root access not granted");
        }

        console.log("Root access OK, checking ACC installation...");
        let accPath = 'acc';
        try {
            console.log("Trying ACC in PATH...");
            const version = await commandExecutor.exec(accPath, ['-v']);
            console.log("ACC found in PATH, version:", version);
            document.getElementById('acc-install-status').textContent = 'Found in PATH';
            document.getElementById('acc-version').textContent = version.trim();
            updateStatusClass(document.getElementById('acc-install-status'), 'OK');
            updateStatusClass(document.getElementById('acc-version'), version);

            document.getElementById('control-panel').style.display = 'block';
            document.getElementById('config-panel').style.display = 'block';
            document.getElementById('log-panel').style.display = 'block';
            document.getElementById('maintenance-panel').style.display = 'block';
            document.getElementById('settings-panel').style.display = 'block';

            globalAccPath = accPath;
            console.log("Initializing UI (non-blocking)...");
            
            // Initialize UI without awaiting - let it load in background
            initializeUI(accPath).catch(e => {
                console.error("UI initialization error:", e);
                showError("Some features may not work properly. Try refreshing.", 'warn');
            });
            
            // Hide loading overlay after a short delay to ensure UI is visible
            setTimeout(hideLoadingOverlay, 500);
            
            console.log("System verification completed successfully");
            return;
        } catch (e) {
            console.log(`ACC not in PATH: ${e}, trying other locations...`);
        }

        const ACC_PATHS = [
            '/data/adb/vr25/acc/acc',
            '/data/adb/modules/acc/acc.sh',
            '/dev/acc',
            '/system/bin/acc',
            '/data/adb/vr25/bin/acc'
        ];

        for (const path of ACC_PATHS) {
            try {
                console.log(`Trying ACC at ${path}...`);
                const version = await commandExecutor.exec(path, ['-v']);
                console.log(`ACC found at ${path}, version:`, version);
                accPath = path;
                document.getElementById('acc-install-status').textContent = `Found at ${path}`;
                document.getElementById('acc-version').textContent = version.trim();
                updateStatusClass(document.getElementById('acc-install-status'), 'OK');
                updateStatusClass(document.getElementById('acc-version'), version);

                document.getElementById('control-panel').style.display = 'block';
                document.getElementById('config-panel').style.display = 'block';
                document.getElementById('log-panel').style.display = 'block';
                document.getElementById('maintenance-panel').style.display = 'block';
                document.getElementById('settings-panel').style.display = 'block';

                globalAccPath = accPath;
                console.log("Initializing UI (non-blocking)...");
                
                // Initialize UI without awaiting - let it load in background
                initializeUI(accPath).catch(e => {
                    console.error("UI initialization error:", e);
                    showError("Some features may not work properly. Try refreshing.", 'warn');
                });
                
                // Hide loading overlay after a short delay to ensure UI is visible
                setTimeout(hideLoadingOverlay, 500);
                
                console.log("System verification completed successfully");
                return;
            } catch (e) {
                console.log(`Not found at ${path}: ${e}`);
            }
        }

        throw new Error("ACC binary not found");
    } catch (e) {
        console.error("System verification failed:", e);
        showError(`System verification failed: ${e}`);
        updateStatusClass(document.getElementById('root-status'), 'Failed');
        updateStatusClass(document.getElementById('acc-install-status'), 'Failed');
        hideLoadingOverlay();
    }
}

async function ensureAccdRunning(accPath) {
    try {
        // Quick check without blocking too long
        const running = await commandExecutor.exec('pgrep', ['-f', 'accd'], 3000);
        if (!running.trim()) {
            debugLog("Starting accd daemon", 'INFO');
            // Start daemon without waiting for full initialization
            commandExecutor.exec(accPath, ['--init']).catch(e => {
                debugLog(`accd start warning: ${e}`, 'WARN');
            });
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            debugLog("accd daemon already running", 'INFO');
        }
    } catch (e) {
        debugLog(`accd check/start: ${e}`, 'WARN');
        // Don't throw - allow UI to load even if daemon check fails
        // User can manually start it if needed
    }
}

async function loadLogs() {
    try {
        const logs = await logManager.getRecentLogs(100);
        document.getElementById('log-display').textContent = logs;
        document.getElementById('log-display').scrollTop = document.getElementById('log-display').scrollHeight;
        await logManager.info("Logs viewed");
    } catch (e) {
        document.getElementById('log-display').textContent = `Error loading logs: ${e}`;
        await logManager.error(`Log load error: ${e}`);
    }
}

async function initializeUI(accPath) {
    debugLog(`Initializing with ACC path: ${accPath}`, 'INFO');

    // Don't block UI initialization if daemon check fails
    ensureAccdRunning(accPath).catch(e => {
        showError("Daemon may not be running. Some features may not work. Try manually starting accd.", 'warn');
    });

    const batteryHealthBtn = document.getElementById('battery-health-btn');
    const testSwitchesBtn = document.getElementById('test-switches-btn');
    const disableChargingBtn = document.getElementById('disable-charging-btn');
    const enableChargingBtn = document.getElementById('enable-charging-btn');
    const forceChargeBtn = document.getElementById('force-charge-btn');
    const resetBatteryStatsBtn = document.getElementById('reset-battery-stats-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const restartBtn = document.getElementById('restart-btn');
    const stopBtn = document.getElementById('stop-btn');
    const startBtn = document.getElementById('start-btn');
    const refreshLogsBtn = document.getElementById('refresh-logs-btn');
    const exportLogsBtn = document.getElementById('export-logs-btn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const upgradeBtn = document.getElementById('upgrade-btn');
    const uninstallBtn = document.getElementById('uninstall-btn');
    const rollbackBtn = document.getElementById('rollback-btn');
    const versionBtn = document.getElementById('version-btn');
    const detailedInfoBtn = document.getElementById('detailed-info-btn');
    const readmeBtn = document.getElementById('readme-btn');
    const logtailBtn = document.getElementById('logtail-btn');

    async function loadConfig() {
        try {
            const config = await commandExecutor.exec(accPath, ['-s']);
            const configLines = config.split('\n').filter(l => l.trim());
            const configMap = {};
            
            configLines.forEach(line => {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    configMap[match[1].trim()] = match[2].trim();
                }
            });

            const chargeLimit = configMap.pause_capacity || configMap.capacity || '-';
            const resumeCharge = configMap.resume_capacity || '-';
            const pauseAt = `${chargeLimit}%`;
            
            document.getElementById('charge-limit').textContent = chargeLimit + (chargeLimit !== '-' ? '%' : '');
            document.getElementById('resume-charge').textContent = resumeCharge + (resumeCharge !== '-' ? '%' : '');
            document.getElementById('pause-at').textContent = pauseAt;
            
            await logManager.info("Config loaded");
        } catch (e) {
            await logManager.error(`Config error: ${e}`);
        }
    }

    batteryHealthBtn.addEventListener('click', async () => {
        try {
            setButtonLoading(batteryHealthBtn, true);
            const mAh = prompt("Enter battery capacity in mAh (leave empty to auto-detect):");
            const args = ['-H'];
            if (mAh && mAh.trim()) {
                args.push(mAh.trim());
            }
            const health = await commandExecutor.exec(accPath, args);
            const healthValue = health.trim();
            if (healthValue === '!') {
                document.getElementById('battery-health').textContent = 'Unable to calculate (missing counter data)';
                updateStatusClass(document.getElementById('battery-health'), 'Error');
                showError("Battery health check failed: missing charge counter data", 'error');
            } else {
                document.getElementById('battery-health').textContent = healthValue;
                updateStatusClass(document.getElementById('battery-health'), 'OK');
                showError("Battery health: " + healthValue, 'success');
            }
            await logManager.info("Battery health checked");
        } catch (e) {
            showError(`Battery health check failed: ${e}`);
            document.getElementById('battery-health').textContent = 'Error';
            updateStatusClass(document.getElementById('battery-health'), 'Error');
            await logManager.error(`Battery health error: ${e}`);
        } finally {
            setButtonLoading(batteryHealthBtn, false);
        }
    });

    testSwitchesBtn.addEventListener('click', () => {
        document.getElementById('test-switches-modal').style.display = 'block';
        document.getElementById('test-switches-output').textContent = 'Click "Run Test" to start testing charging switches...\n\nThis may take several minutes. Ensure charger is plugged in.\n';
    });

    disableChargingBtn.addEventListener('click', async () => {
        const input = prompt("Disable charging until battery level reaches (% or mV) or for duration (e.g., 1h, 30m):", "70%");
        if (input && input.trim()) {
            try {
                await commandExecutor.exec(accPath, ['-d', input.trim()]);
                showError("Charging disabled until " + input.trim(), 'success');
                setTimeout(hideError, 3000);
                await logManager.info("Charging disabled until " + input.trim());
                await loadStatus();
            } catch (e) {
                showError(`Disable charging failed: ${e}`);
                await logManager.error(`Disable charging error: ${e}`);
            }
        }
    });

    enableChargingBtn.addEventListener('click', async () => {
        const input = prompt("Enable charging to battery level (%) or for duration (e.g., 30m):", "80%");
        if (input && input.trim()) {
            try {
                await commandExecutor.exec(accPath, ['-e', input.trim()]);
                showError("Charging enabled to " + input.trim(), 'success');
                setTimeout(hideError, 3000);
                await logManager.info("Charging enabled to " + input.trim());
                await loadStatus();
            } catch (e) {
                showError(`Enable charging failed: ${e}`);
                await logManager.error(`Enable charging error: ${e}`);
            }
        }
    });

    forceChargeBtn.addEventListener('click', async () => {
        const capacity = prompt("Force charge to battery level (%) or leave empty for 100%:", "100");
        if (capacity !== null) { // Allow empty string for default 100%
            try {
                const args = ['-f'];
                if (capacity && capacity.trim()) {
                    args.push(capacity.trim());
                }
                await commandExecutor.exec(accPath, args);
                const target = capacity && capacity.trim() ? capacity.trim() : "100%";
                showError("Force charging to " + target + " initiated", 'success');
                setTimeout(hideError, 3000);
                await logManager.info("Force charging to " + target);
                await loadStatus();
            } catch (e) {
                showError(`Force charge failed: ${e}`);
                await logManager.error(`Force charge error: ${e}`);
            }
        }
    });

    resetBatteryStatsBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to reset battery statistics?")) {
            try {
                const result = await commandExecutor.exec(accPath, ['-R']);
                if (result.trim() === '✅') {
                    showError("Battery statistics reset successfully", 'success');
                } else {
                    showError("Battery statistics reset: " + result.trim(), 'success');
                }
                setTimeout(hideError, 3000);
                await logManager.info("Battery statistics reset");
                await loadStatus();
            } catch (e) {
                showError(`Reset battery stats failed: ${e}`);
                await logManager.error(`Reset battery stats error: ${e}`);
            }
        }
    });

    refreshBtn.addEventListener('click', async () => {
        try {
            setButtonLoading(refreshBtn, true);
            await logManager.info("Manual refresh");
            await loadStatus();
            await loadConfig();
            showError("Status refreshed successfully!", 'success');
            setTimeout(hideError, 2000);
        } catch (e) {
            showError(`Refresh failed: ${e}`, 'error');
        } finally {
            setButtonLoading(refreshBtn, false);
        }
    });

    restartBtn.addEventListener('click', async () => {
        try {
            await logManager.info("Restarting accd");
            await commandExecutor.exec('pkill', ['-f', 'accd']);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await commandExecutor.exec(accPath, ['--init']);
            await loadStatus();
        } catch (e) {
            showError(`Restart failed: ${e}`);
            await logManager.error(`Restart error: ${e}`);
        }
    });

    stopBtn.addEventListener('click', async () => {
        try {
            await commandExecutor.exec('pkill', ['-f', 'accd']);
            await logManager.info("accd stopped");
            await loadStatus();
        } catch (e) {
            showError(`Stop failed: ${e}`);
            await logManager.error(`Stop error: ${e}`);
        }
    });

    startBtn.addEventListener('click', async () => {
        try {
            await commandExecutor.exec(accPath, ['--init']);
            await logManager.info("accd started");
            await loadStatus();
        } catch (e) {
            showError(`Start failed: ${e}`);
            await logManager.error(`Start error: ${e}`);
        }
    });

    refreshLogsBtn.addEventListener('click', loadLogs);

    exportLogsBtn.addEventListener('click', async () => {
        const origText = exportLogsBtn.textContent;
        exportLogsBtn.disabled = true;
        exportLogsBtn.textContent = 'Exporting...';
        try {
            // acc -le may exit non-zero (tar warnings) even on success; ignore exit code
            await commandExecutor.execRaw(accPath, ['-le'], 60000);
            // Verify a tgz was actually produced
            const created = await commandExecutor.execRaw('sh', ['-c',
                'ls -t /sdcard/Download/acc-logs-*.tgz 2>/dev/null | head -1']);
            const path = (created.stdout || '').trim();
            if (path) {
                showError(`Logs exported to ${path}`, 'success');
                setTimeout(hideError, 4000);
                await logManager.info("Logs exported");
            } else {
                showError("Export logs failed: no archive created");
                await logManager.error("Export logs: no archive found");
            }
        } finally {
            exportLogsBtn.disabled = false;
            exportLogsBtn.textContent = origText;
        }
    });

    clearLogsBtn.addEventListener('click', async () => {
        try {
            const success = await logManager.clearLogs();
            if (success) {
                await loadLogs();
            } else {
                showError("Clear logs failed");
            }
        } catch (e) {
            showError(`Clear logs error: ${e}`);
        }
    });

    upgradeBtn.addEventListener('click', async () => {
        if (confirm("Check for ACC updates?")) {
            const origText = upgradeBtn.textContent;
            upgradeBtn.disabled = true;
            upgradeBtn.textContent = 'Checking...';
            try {
                // acc -u returns exit 6 when no update is available; don't treat that as an error
                const res = await commandExecutor.execRaw(accPath, ['-u', '-c', '-n'], 60000);
                const raw = (res.stdout || '') + ' ' + (res.stderr || '');
                // Strip download progress noise (#### / #=#=# / 100.0%)
                const clean = raw
                    .replace(/\r/g, '\n')
                    .split('\n')
                    .map(l => l.replace(/#+/g, '').replace(/\d+\.\d+%/g, '').trim())
                    .filter(l => l.length > 0)
                    .join(' ')
                    .trim();

                if (/no update available/i.test(clean)) {
                    showError("ACC is up to date", 'info');
                } else {
                    const verCode = (clean.match(/\b(\d{6,})\b/) || [])[1];
                    if (verCode) {
                        if (confirm(`Update available (${verCode}). Install now?`)) {
                            upgradeBtn.textContent = 'Updating...';
                            await commandExecutor.execRaw(accPath, ['-u', '-f'], 120000);
                            showError("ACC updated. Please reboot to apply.", 'success');
                        }
                    } else {
                        showError("ACC is up to date", 'info');
                    }
                }
                await logManager.info("Checked for updates");
            } catch (e) {
                showError(`Update check failed: ${e}`);
                await logManager.error(`Update check error: ${e}`);
            } finally {
                upgradeBtn.disabled = false;
                upgradeBtn.textContent = origText;
            }
        }
    });

    uninstallBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to uninstall ACC? This will remove all ACC files and configurations.")) {
            try {
                const result = await commandExecutor.exec(accPath, ['-U']);
                if (result.trim() === '✅') {
                    showError("ACC uninstalled successfully", 'success');
                } else {
                    showError("ACC uninstall: " + result.trim(), 'success');
                }
                await logManager.info("ACC uninstalled");
            } catch (e) {
                showError(`Uninstall failed: ${e}`);
                await logManager.error(`Uninstall error: ${e}`);
            }
        }
    });

    rollbackBtn.addEventListener('click', async () => {
        const version = prompt("Enter version to rollback to (leave empty for previous):");
        try {
            const args = ['-b'];
            if (version && version.trim()) {
                args.push(version.trim());
            }
            const result = await commandExecutor.exec(accPath, args);
            showError("Rollback completed: " + result.trim(), 'success');
            await logManager.info("Rollback completed");
        } catch (e) {
            showError(`Rollback failed: ${e}`);
            await logManager.error(`Rollback error: ${e}`);
        }
    });

    versionBtn.addEventListener('click', async () => {
        try {
            // Show loading feedback immediately
            versionBtn.disabled = true;
            versionBtn.textContent = 'Checking...';
            
            const version = await commandExecutor.exec(accPath, ['-v']);
            
            versionBtn.disabled = false;
            versionBtn.textContent = 'Show Version';
            
            showError("ACC Version: " + version.trim(), 'info');
            await logManager.info("Version checked: " + version.trim());
        } catch (e) {
            versionBtn.disabled = false;
            versionBtn.textContent = 'Show Version';
            showError(`Version check failed: ${e}`);
            await logManager.error(`Version check error: ${e}`);
        }
    });

    detailedInfoBtn.addEventListener('click', async () => {
        const panel = document.getElementById('detailed-info-panel');
        if (panel.style.display === 'none' || !panel.style.display) {
            try {
                const info = await commandExecutor.exec(accPath, ['-i']);
                document.getElementById('detailed-info-content').textContent = info;
                panel.style.display = 'block';
                detailedInfoBtn.textContent = 'Hide Detailed Info';
                await logManager.info("Detailed battery info displayed");
            } catch (e) {
                showError(`Failed to get detailed info: ${e}`);
                await logManager.error(`Detailed info error: ${e}`);
            }
        } else {
            panel.style.display = 'none';
            detailedInfoBtn.textContent = 'Detailed Battery Info';
        }
    });

    readmeBtn.addEventListener('click', async () => {
        const readmePaths = [
            '/data/adb/vr25/acc-data/README.md',
            '/data/adb/vr25/acc/README.md',
            '/data/adb/modules/acc/README.md'
        ];
        let readme = null;
        for (const p of readmePaths) {
            try {
                const out = await commandExecutor.exec('cat', [p]);
                if (out && out.trim().length > 0) { readme = out; break; }
            } catch (e) { /* try next path */ }
        }
        if (readme) {
            document.getElementById('readme-content').innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px;">${readme.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
            document.getElementById('readme-modal').style.display = 'block';
            await logManager.info("README displayed");
        } else {
            // Fallback: open the online manual in a browser
            const url = 'https://github.com/kgursu/acc-webui-kernelsu/blob/dev/README.md';
            try {
                await commandExecutor.exec('su', ['-c', `am start -a android.intent.action.VIEW -d ${url}`]);
                showError("Opening manual in browser...", 'info');
            } catch (e) {
                showError(`Manual not found locally. Visit: ${url}`, 'info');
            }
            await logManager.info("README opened online (local copy missing)");
        }
    });

    document.getElementById('close-readme').addEventListener('click', () => {
        document.getElementById('readme-modal').style.display = 'none';
    });

    logtailBtn.addEventListener('click', async () => {
        try {
            // Show loading feedback immediately
            logtailBtn.disabled = true;
            logtailBtn.textContent = 'Loading Logs...';
            
            // Get recent logs (non-blocking, no -f flag)
            const logs = await commandExecutor.exec('sh', ['-c', 'tail -n 100 /data/adb/vr25/acc-data/logs/acc-*.log 2>/dev/null || echo "No logs found"']);
            
            // Display logs in a modal instead of freezing UI
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'block';
            modal.innerHTML = `
                <div class="modal-content large-modal">
                    <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
                    <h2>ACC Log Monitor (Last 100 lines)</h2>
                    <pre style="max-height: 400px; overflow-y: auto; background: #000; color: #0f0; padding: 12px; white-space: pre-wrap; border-radius: 8px;">${logs || 'No logs available'}</pre>
                    <div class="button-group" style="margin-top: 16px;">
                        <button onclick="navigator.clipboard.writeText(\`${logs.replace(/`/g, '\\`')}\`); this.textContent='Copied!';">Copy Logs</button>
                        <button onclick="this.closest('.modal').remove();">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Close modal on outside click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
            
            logtailBtn.disabled = false;
            logtailBtn.textContent = 'Log Monitor';
            await logManager.info("Log monitor opened");
        } catch (e) {
            logtailBtn.disabled = false;
            logtailBtn.textContent = 'Log Monitor';
            showError(`Failed to load logs: ${e}`);
            await logManager.error(`Log monitor error: ${e}`);
        }
    });

    await logManager.ensureLogDirectory();
    
    // Load data asynchronously without blocking UI initialization
    // Use Promise.allSettled to load in parallel and continue even if some fail
    Promise.allSettled([
        loadStatus(),
        loadConfig(),
        loadLogs()
    ]).then(results => {
        results.forEach((result, index) => {
            const names = ['Status', 'Config', 'Logs'];
            if (result.status === 'rejected') {
                debugLog(`${names[index]} load failed: ${result.reason}`, 'WARN');
            }
        });
    });

    document.getElementById('run-test-switches').addEventListener('click', async () => {
        const outputElement = document.getElementById('test-switches-output');
        const runBtn = document.getElementById('run-test-switches');
        const stopBtn = document.getElementById('stop-test-switches');
        
        runBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        outputElement.textContent = 'Starting switch test...\n\n⏳ This may take several minutes. Testing charging switches...\n\n';
        
        let testTerminalId = null;
        let checkInterval = null;
        
        try {
            // Start the test command in background
            const callback = `test_callback_${Date.now()}`;
            window[callback] = function(errno, stdout, stderr) {
                delete window[callback];
                if (errno === 0) {
                    outputElement.textContent += '\n✅ Test completed!\n\n' + stdout;
                } else {
                    outputElement.textContent += '\n❌ Test failed\n\n' + (stderr || stdout || 'Unknown error');
                }
                runBtn.style.display = 'inline-block';
                stopBtn.style.display = 'none';
                if (checkInterval) clearInterval(checkInterval);
            };
            
            // Execute with streaming output simulation
            ksu.exec(`${globalAccPath || accPath} -t 2>&1`, callback);
            
            // Simulate progress updates since we can't get real-time streaming
            let dots = 0;
            const progressMessages = [
                '📋 Analyzing battery interface...',
                '🔌 Testing charging switches...',
                '⚡ Checking switch compatibility...',
                '🔍 Validating results...',
                '📊 Compiling test report...'
            ];
            let msgIndex = 0;
            
            checkInterval = setInterval(() => {
                dots = (dots + 1) % 4;
                const dotString = '.'.repeat(dots);
                const currentMsg = progressMessages[msgIndex % progressMessages.length];
                outputElement.textContent = `Starting switch test...\n\n⏳ This may take several minutes. Testing charging switches${dotString}\n\n${currentMsg}\n\nPlease wait, this process cannot be interrupted safely.`;
                msgIndex++;
            }, 3000);
            
            await logManager.info("Charging switches test started");
        } catch (e) {
            outputElement.textContent += `\n❌ Error: ${e}`;
            await logManager.error(`Switch test error: ${e}`);
            runBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            if (checkInterval) clearInterval(checkInterval);
        }
    });

    document.getElementById('stop-test-switches').addEventListener('click', () => {
        document.getElementById('test-switches-modal').style.display = 'none';
        showError("Test cancelled", 'info');
    });

    document.getElementById('close-test-switches').addEventListener('click', () => {
        document.getElementById('test-switches-modal').style.display = 'none';
    });

    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    setInterval(loadStatus, 10000);
    setInterval(loadLogs, 30000);
}

function initializeMainTabs() {
    const navButtons = document.querySelectorAll('.nav-button');
    
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-main-tab');
            
            document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.main-tab-pane').forEach(pane => pane.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            debugLog(`Switched to tab: ${tabId}`, 'INFO');
        });
    });
}

async function loadStatus() {
    await updateStatus();
}

// Initialize debug mode from localStorage
function initializeDebugMode() {
    const debugConsoleCard = document.getElementById('debug-console-card');
    const debugModeToggle = document.getElementById('debug-mode-toggle');
    
    // Load saved preference (default: disabled)
    const debugModeEnabled = localStorage.getItem('debugModeEnabled') === 'true';
    
    // Set the toggle value
    debugModeToggle.value = debugModeEnabled ? 'true' : 'false';
    
    // Apply the setting
    if (debugModeEnabled) {
        debugConsoleCard.classList.add('enabled');
    } else {
        debugConsoleCard.classList.remove('enabled');
    }
    
    // Listen for changes
    debugModeToggle.addEventListener('change', function() {
        const isEnabled = this.value === 'true';
        localStorage.setItem('debugModeEnabled', isEnabled);
        
        if (isEnabled) {
            debugConsoleCard.classList.add('enabled');
            showError('Debug console enabled - visible on all pages', 'info');
        } else {
            debugConsoleCard.classList.remove('enabled');
            showError('Debug console disabled', 'info');
        }
        
        debugLog(`Debug mode ${isEnabled ? 'enabled' : 'disabled'}`, 'INFO');
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        initializeMainTabs();

        if (typeof ksu === 'undefined' || !ksu.exec) {
            console.error("KernelSU API not available");
            showError("KernelSU API not available. This webui requires KernelSU to function properly.");
            return;
        }

        console.log("KernelSU API available, initializing...");

        try {
            await logManager.ensureLogDirectory();
            await logManager.info("WebView starting");
        } catch (logError) {
            console.warn("Logging initialization failed:", logError);
        }

        await verifySystem();
        
        // Initialize debug mode toggle
        initializeDebugMode();
    } catch (e) {
        console.error("Initialization failed:", e);
        showError("Initialization failed. Check console for details.");
    }
});
// Tab scroll indicator: show right arrow/fade when more tabs are off-screen
(function setupTabScrollIndicator() {
    function update(wrap) {
        const tabs = wrap.querySelector('.tab-buttons');
        if (!tabs) return;
        const scrollable = tabs.scrollWidth > tabs.clientWidth + 2;
        wrap.classList.toggle('scrollable', scrollable);
        const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 2;
        wrap.classList.toggle('scrolled-end', atEnd);
    }
    function init() {
        document.querySelectorAll('.tab-buttons-wrap').forEach(wrap => {
            const tabs = wrap.querySelector('.tab-buttons');
            if (!tabs) return;
            update(wrap);
            tabs.addEventListener('scroll', () => update(wrap), { passive: true });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('resize', () => {
        document.querySelectorAll('.tab-buttons-wrap').forEach(update);
    }, { passive: true });
})();
