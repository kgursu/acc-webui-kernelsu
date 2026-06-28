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
    exec: function(command, args = [], timeout = 15000) {
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
    execRaw: function(command, args = [], timeout = 15000) {
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
    errorBox.style.pointerEvents = 'auto';
    errorBox.onclick = hideError;
    debugLog(`${type.toUpperCase()}: ${message}`, 'INFO');
    // Persist every prompt to a dedicated, timestamped WebUI prompt log
    try {
        const ts = new Date().toISOString();
        const safe = String(message).replace(/'/g, "'\\''");
        const line = `[${ts}] [${type.toUpperCase()}] ${safe}`;
        commandExecutor.execRaw('sh', ['-c',
            `echo '${line}' >> /data/adb/vr25/acc-data/logs/webui-prompts.log`], 5000).catch(() => {});
    } catch (e) { /* non-fatal */ }
    clearTimeout(window._errTimer);
    window._errTimer = setTimeout(hideError, (type === 'error' || type === 'warn') ? 6000 : 4000);
}

function hideError() {
    clearTimeout(window._errTimer);
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

        // Update daemon status by querying ACC directly (acc -D => "accd," running / "accd." stopped)
        let daemonRunning = true;
        try {
            const d = await commandExecutor.execRaw(globalAccPath, ['-D'], 10000);
            const dout = (d.stdout || '').trim();
            if (/accd\.|not running|stopped|isn't running/i.test(dout)) {
                daemonRunning = false;
            } else if (/accd,|running/i.test(dout)) {
                daemonRunning = true;
            }
        } catch (e) { /* keep default */ }

        document.getElementById('daemon-status').textContent = daemonRunning ? 'Running' : 'Stopped';
        
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

        updateStatusClass(document.getElementById('daemon-status'), daemonRunning ? 'Running' : 'Stopped');
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

// Extract just the ACC version from `acc -v` output.
// The daemon may prepend lines like "accd --init" or progress text; keep the version token.
function cleanVersion(raw) {
    if (!raw) return '-';
    const text = String(raw).replace(/\r/g, '\n');
    // Look for a vX.Y... token (optionally followed by "(N)")
    const m = text.match(/v\d[\w.\-]*(?:\s*\(\d+\))?/);
    if (m) return m[0].trim();
    // Fallback: last non-empty line, stripped of known noise
    const lines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l && !/accd|--init|⏳|#|%/.test(l));
    return lines.length ? lines[lines.length - 1] : '-';
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
            document.getElementById('acc-version').textContent = cleanVersion(version);
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
            '/data/adb/modules/acc/acc.sh',
            '/data/adb/vr25/acc/acc.sh',
            '/data/adb/vr25/acc/acc',
            '/dev/acc',
            '/data/adb/vr25/bin/acc',
            '/system/bin/acc'
        ];

        for (const path of ACC_PATHS) {
            try {
                console.log(`Trying ACC at ${path}...`);
                const version = await commandExecutor.exec(path, ['-v']);
                console.log(`ACC found at ${path}, version:`, version);
                accPath = path;
                document.getElementById('acc-install-status').textContent = `Found at ${path}`;
                document.getElementById('acc-version').textContent = cleanVersion(version);
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
    const promptLogBtn = document.getElementById('prompt-log-btn');
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
            // Use ACC's own daemon control; nohup+setsid keeps it alive on APatch/FolkPatch
            await commandExecutor.execRaw('su', ['-c',
                `nohup setsid ${accPath || 'acc'} -D restart >/dev/null 2>&1 &`], 10000);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await loadStatus();
            showError("Daemon restarted", 'success');
        } catch (e) {
            showError(`Restart failed: ${e}`);
            await logManager.error(`Restart error: ${e}`);
        }
    });

    stopBtn.addEventListener('click', async () => {
        try {
            await commandExecutor.execRaw(accPath, ['-D', 'stop'], 10000);
            await logManager.info("accd stopped");
            await new Promise(resolve => setTimeout(resolve, 800));
            await loadStatus();
            showError("Daemon stopped", 'success');
        } catch (e) {
            showError(`Stop failed: ${e}`);
            await logManager.error(`Stop error: ${e}`);
        }
    });

    startBtn.addEventListener('click', async () => {
        try {
            // acc -D start can fail to detach after a stop; restart works whether running or not
            await commandExecutor.execRaw('su', ['-c',
                `nohup setsid ${accPath || 'acc'} -D restart >/dev/null 2>&1 &`], 10000);
            await logManager.info("accd started");
            await new Promise(resolve => setTimeout(resolve, 1500));
            await loadStatus();
            showError("Daemon started", 'success');
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
        outputElement.textContent = 'Starting switch test...\n\nEnsure charger is plugged in.\n\n';

        // Stream approach: run acc -t in the background writing to a log file,
        // then poll the file so output appears live without blocking the WebView.
        const acc = globalAccPath || accPath || 'acc';
        const LOGF = '/data/adb/vr25/acc-data/logs/webui-test-live.log';
        const DONEF = LOGF + '.done';
        let pollInterval = null;
        let lastLen = 0;
        window._switchTestRunning = true;

        const finish = () => {
            window._switchTestRunning = false;
            if (pollInterval) clearInterval(pollInterval);
            runBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
        };

        try {
            const launch = `sh -c 'rm -f ${LOGF} ${DONEF}; (${acc} -t >${LOGF} 2>&1; echo EXIT:$? >>${LOGF}; touch ${DONEF}) >/dev/null 2>&1 &'`;
            await commandExecutor.execRaw('su', ['-c', launch], 8000).catch(() => {});
            await logManager.info("Charging switches test started (streaming)");

            pollInterval = setInterval(async () => {
                if (!window._switchTestRunning) return;
                try {
                    const res = await commandExecutor.execRaw('sh', ['-c', `cat ${LOGF} 2>/dev/null`], 8000);
                    const content = res.stdout || '';
                    if (content.length !== lastLen) {
                        lastLen = content.length;
                        outputElement.textContent = content.replace(/\nEXIT:\d+\s*$/, '\n');
                        outputElement.scrollTop = outputElement.scrollHeight;
                    }
                    const done = await commandExecutor.execRaw('sh', ['-c', `[ -f ${DONEF} ] && echo done`], 5000);
                    if ((done.stdout || '').trim() === 'done') {
                        const m = content.match(/EXIT:(\d+)/);
                        const code = m ? m[1] : '?';
                        outputElement.textContent = content.replace(/\nEXIT:\d+\s*$/, '\n') +
                            (code === '0' ? '\n\nTest completed.\n' : `\n\nTest finished (exit ${code}).\n`);
                        outputElement.scrollTop = outputElement.scrollHeight;
                        finish();
                    }
                } catch (e) {
                    // transient read error; keep polling
                }
            }, 1000);
        } catch (e) {
            outputElement.textContent += `\nError: ${e}`;
            await logManager.error(`Switch test error: ${e}`);
            finish();
        }
    });

    document.getElementById('stop-test-switches').addEventListener('click', async () => {
        window._switchTestRunning = false;
        // Attempt to stop the running test and re-enable charging so the device
        // never gets stuck in a non-charging state.
        try {
            await commandExecutor.execRaw('su', ['-c',
                "pkill -f 'acc -t' 2>/dev/null; pkill -f accd 2>/dev/null; " +
                (globalAccPath || accPath || 'acc') + " -e >/dev/null 2>&1; " +
                "nohup setsid " + (globalAccPath || accPath || 'acc') + " -D restart >/dev/null 2>&1 &"], 10000).catch(()=>{});
        } catch (e) { /* best effort */ }
        const runBtn = document.getElementById('run-test-switches');
        const stopBtn = document.getElementById('stop-test-switches');
        if (runBtn) runBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        document.getElementById('test-switches-modal').style.display = 'none';
        showError("Test stopped, charging re-enabled", 'info');
    });

    document.getElementById('close-test-switches').addEventListener('click', () => {
        window._switchTestRunning = false;
        document.getElementById('test-switches-modal').style.display = 'none';
    });

    // Prompt log viewer
    const PROMPT_LOG = '/data/adb/vr25/acc-data/logs/webui-prompts.log';
    async function loadPromptLog() {
        const out = document.getElementById('prompt-log-output');
        if (!out) return;
        try {
            const res = await commandExecutor.execRaw('sh', ['-c', `tail -n 200 ${PROMPT_LOG} 2>/dev/null`], 8000);
            const txt = (res.stdout || '').trim();
            out.textContent = txt || 'No prompts logged yet.';
            out.scrollTop = out.scrollHeight;
        } catch (e) {
            out.textContent = `Could not read prompt log: ${e}`;
        }
    }
    if (promptLogBtn) {
        promptLogBtn.addEventListener('click', () => {
            document.getElementById('prompt-log-modal').style.display = 'block';
            loadPromptLog();
        });
    }
    const closePromptLog = document.getElementById('close-prompt-log');
    if (closePromptLog) closePromptLog.addEventListener('click', () => {
        document.getElementById('prompt-log-modal').style.display = 'none';
    });
    const refreshPromptLog = document.getElementById('refresh-prompt-log');
    if (refreshPromptLog) refreshPromptLog.addEventListener('click', loadPromptLog);
    const copyPromptLog = document.getElementById('copy-prompt-log');
    if (copyPromptLog) copyPromptLog.addEventListener('click', async () => {
        const out = document.getElementById('prompt-log-output');
        const text = out ? out.textContent : '';
        if (!text || text === 'No prompts logged yet.') {
            showError("Nothing to copy", 'info');
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for WebViews without async clipboard API
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            showError("Prompt log copied to clipboard", 'success');
        } catch (e) {
            showError(`Copy failed: ${e}`);
        }
    });
    const clearPromptLog = document.getElementById('clear-prompt-log');
    if (clearPromptLog) clearPromptLog.addEventListener('click', async () => {
        try {
            await commandExecutor.execRaw('sh', ['-c', `: > ${PROMPT_LOG}`], 5000);
            loadPromptLog();
            showError("Prompt log cleared", 'success');
        } catch (e) {
            showError(`Failed to clear prompt log: ${e}`);
        }
    });

    // --- Switch enable/disable management ---
    // ch-switches holds the test pool (one switch per line, e.g. "battery/charging_enabled 1 0").
    // We keep our own persistent exclusion file; service.sh removes those lines from ch-switches on boot.
    const CH_SWITCHES = '/dev/.vr25/acc/ch-switches';
    const WORKING_SWITCHES = '/data/adb/vr25/acc-data/logs/working-switches.log';
    const EXCLUDED_FILE = '/data/adb/vr25/acc-data/webui-excluded-switches';
    const WRITE_LOG = '/data/adb/vr25/acc-data/logs/write.log';

    // A ch-switches line is "name value1 value2"; the switch name is the first field.
    function switchName(line) { return line.split(/\s+/)[0]; }

    async function readLines(path) {
        try {
            const res = await commandExecutor.execRaw('sh', ['-c', `cat ${path} 2>/dev/null`], 8000);
            return (res.stdout || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
        } catch (e) { return []; }
    }

    // Returns the set of switch names commented out (#name) in write.log.
    // ACC marks a switch with "#" while testing and leaves it if the test locked the device,
    // so a "#name" means "skip this switch during Test Switches".
    async function readHashedNames() {
        const lines = await readLines(WRITE_LOG);
        const set = new Set();
        for (const l of lines) {
            if (l.startsWith('#')) set.add(l.slice(1).trim());
        }
        return set;
    }

    async function updateDisabledSwitchesCount() {
        const el = document.getElementById('disabled-switches-count');
        if (!el) return;
        const [excluded, hashed] = await Promise.all([readLines(EXCLUDED_FILE), readHashedNames()]);
        // Group disabled entries by switch name, counting variants from our exclusion file.
        const counts = new Map();
        for (const line of excluded) {
            const n = switchName(line);
            counts.set(n, (counts.get(n) || 0) + 1);
        }
        // write.log "#name" entries are name-level (no variant), include them if not already listed
        for (const n of hashed) {
            if (!counts.has(n)) counts.set(n, 1);
        }
        if (counts.size === 0) {
            el.textContent = 'None';
            return;
        }
        const parts = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([n, c]) => c > 1 ? `${n} (${c} types)` : n);
        el.textContent = parts.join(', ');
    }

    // working-switches.log lists every switch ACC tested, tagged like "[d] name v1 v2".
    // Strip the tag to get the bare "name v1 v2" line, matching our ch-switches format.
    function stripWorkingTag(line) {
        return line.replace(/^\[[a-z]\]\s+/i, '').replace(/\s*\{[^}]*\}\s*$/, '').trim();
    }

    async function loadSwitchesList() {
        const container = document.getElementById('switches-list');
        if (!container) return;
        container.textContent = 'Loading switches...';
        const [pool, working, excluded, hashed] = await Promise.all([
            readLines(CH_SWITCHES), readLines(WORKING_SWITCHES),
            readLines(EXCLUDED_FILE), readHashedNames()
        ]);
        const excludedSet = new Set(excluded);
        const workingLines = working.map(stripWorkingTag).filter(l => l.length > 0);
        // Show every switch ACC tested (working-switches.log) plus the live pool and our excluded
        // lines, so variants that didn't end up in ch-switches are still selectable.
        const all = Array.from(new Set([...workingLines, ...pool, ...excluded])).sort();
        if (all.length === 0) {
            container.textContent = 'No switches found. Run Test Switches once to populate the list.';
            return;
        }
        container.innerHTML = '';
        all.forEach((line) => {
            // A line counts as disabled if we excluded the exact line, or write.log skips its name
            const name = switchName(line);
            const disabled = excludedSet.has(line) || hashed.has(name);
            const row = document.createElement('label');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer; font-family:monospace; font-size:12px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !disabled;
            cb.dataset.line = line;
            cb.style.cssText = 'width:18px; height:18px; flex-shrink:0;';
            const span = document.createElement('span');
            span.textContent = line;
            span.style.cssText = 'word-break:break-all;';
            row.appendChild(cb);
            row.appendChild(span);
            container.appendChild(row);
        });
    }

    async function applySwitches() {
        const container = document.getElementById('switches-list');
        if (!container) return;
        const boxes = container.querySelectorAll('input[type="checkbox"]');
        const excluded = [];
        const enabledNames = new Set();
        const disabledNames = new Set();
        boxes.forEach(cb => {
            const line = cb.dataset.line;
            const name = switchName(line);
            if (!cb.checked) { excluded.push(line); disabledNames.add(name); }
            else { enabledNames.add(name); }
        });
        // A name keeps its write.log "#" only if it still has at least one disabled variant.
        // So names that are enabled AND have no disabled variant left get their "#" removed.
        const namesToUnhash = [...enabledNames].filter(n => !disabledNames.has(n));
        try {
            // 1. Our exclusion file holds the exact disabled lines (full granularity)
            const body = excluded.join('\n');
            const b64 = btoa(unescape(encodeURIComponent(body + (body ? '\n' : ''))));
            await commandExecutor.execRaw('su', ['-c',
                `echo '${b64}' | base64 -d > ${EXCLUDED_FILE}`], 8000);
            // 2. Remove disabled lines from the live pool now
            for (const line of excluded) {
                const esc = line.replace(/[\\/&|]/g, '\\$&');
                await commandExecutor.execRaw('su', ['-c',
                    `sed -i '\\|^${esc}$|d' ${CH_SWITCHES} 2>/dev/null`], 5000).catch(()=>{});
            }
            // 3. Add "#name" to write.log for disabled switches (so ACC skips them on test)
            for (const name of disabledNames) {
                const esc = name.replace(/[\\/&|]/g, '\\$&');
                // If the bare name exists, comment it; if neither form exists, append "#name"
                await commandExecutor.execRaw('su', ['-c',
                    `touch ${WRITE_LOG}; sed -i '\\|^${esc}$|s|^|#|' ${WRITE_LOG} 2>/dev/null; grep -Eq '^#${esc}$' ${WRITE_LOG} || echo '#${name}' >> ${WRITE_LOG}`], 5000).catch(()=>{});
            }
            // 4. Remove "#" for names that are fully re-enabled (no disabled variant remains)
            for (const name of namesToUnhash) {
                const esc = name.replace(/[\\/&|]/g, '\\$&');
                await commandExecutor.execRaw('su', ['-c',
                    `sed -i '\\|^#${esc}$|s|^#||' ${WRITE_LOG} 2>/dev/null`], 5000).catch(()=>{});
            }
            await updateDisabledSwitchesCount();
            showError(`Saved. ${excluded.length} switch(es) disabled.`, 'success');
            await logManager.info(`Switches disabled: ${excluded.length}`);
        } catch (e) {
            showError(`Failed to save switches: ${e}`);
        }
    }

    const enableDisableBtn = document.getElementById('enable-disable-switches-btn');
    if (enableDisableBtn) enableDisableBtn.addEventListener('click', () => {
        document.getElementById('switches-modal').style.display = 'block';
        loadSwitchesList();
    });
    const closeSwitches = document.getElementById('close-switches');
    if (closeSwitches) closeSwitches.addEventListener('click', () => {
        document.getElementById('switches-modal').style.display = 'none';
    });
    const refreshSwitches = document.getElementById('refresh-switches');
    if (refreshSwitches) refreshSwitches.addEventListener('click', loadSwitchesList);
    const applySwitchesBtn = document.getElementById('apply-switches');
    if (applySwitchesBtn) applySwitchesBtn.addEventListener('click', applySwitches);

    // Reset Switches: clear our exclusion file so all switches are testable again
    const resetSwitchesBtn = document.getElementById('reset-switches-btn');
    if (resetSwitchesBtn) resetSwitchesBtn.addEventListener('click', () => {
        document.getElementById('reset-switches-modal').style.display = 'block';
    });
    const closeResetSwitches = document.getElementById('close-reset-switches');
    if (closeResetSwitches) closeResetSwitches.addEventListener('click', () => {
        document.getElementById('reset-switches-modal').style.display = 'none';
    });

    // Safe Clear: clear only our exclusion file, leave write.log marks intact
    const resetSafeClear = document.getElementById('reset-safe-clear');
    if (resetSafeClear) resetSafeClear.addEventListener('click', async () => {
        try {
            await commandExecutor.execRaw('su', ['-c', `rm -f ${EXCLUDED_FILE}`], 5000);
            await updateDisabledSwitchesCount();
            document.getElementById('reset-switches-modal').style.display = 'none';
            showError("Your disabled list was cleared. write.log marks were kept.", 'success');
            await logManager.info("Switch exclusions cleared (safe)");
        } catch (e) {
            showError(`Failed to clear switches: ${e}`);
        }
    });

    // Set to Defaults: clear our file AND strip every "#" from write.log so all switches are testable
    const resetSetDefaults = document.getElementById('reset-set-defaults');
    if (resetSetDefaults) resetSetDefaults.addEventListener('click', async () => {
        if (!confirm("Set to Defaults removes every skip mark in write.log, including ones ACC added after a switch locked the device. Continue?")) return;
        try {
            await commandExecutor.execRaw('su', ['-c', `rm -f ${EXCLUDED_FILE}`], 5000);
            // Uncomment all lines in write.log (remove leading #), keeping the entries
            await commandExecutor.execRaw('su', ['-c',
                `[ -f ${WRITE_LOG} ] && sed -i 's/^#//' ${WRITE_LOG} 2>/dev/null || :`], 5000);
            await updateDisabledSwitchesCount();
            document.getElementById('reset-switches-modal').style.display = 'none';
            showError("All switches reset to defaults. Reboot to rebuild the pool.", 'success');
            await logManager.info("Switch exclusions reset to defaults (write.log cleared)");
        } catch (e) {
            showError(`Failed to reset switches: ${e}`);
        }
    });

    // Populate the Disabled Switches count on load
    updateDisabledSwitchesCount();

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
    const tabOrder = Array.from(navButtons).map(b => b.getAttribute('data-main-tab'));

    function activateTab(tabId) {
        const btn = document.querySelector(`.nav-button[data-main-tab="${tabId}"]`);
        const pane = document.getElementById(tabId);
        if (!btn || !pane) return;
        document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.main-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        pane.classList.add('active');
        debugLog(`Switched to tab: ${tabId}`, 'INFO');
    }

    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            activateTab(this.getAttribute('data-main-tab'));
        });
    });

    // Swipe left/right anywhere on the page to move between adjacent tabs
    const swipeArea = document.body;
    if (swipeArea) {
        let startX = 0, startY = 0, tracking = false;
        swipeArea.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) { tracking = false; return; }
            // Ignore swipes that start on the bottom nav, an open modal, or a scrollable control
            const t = e.target;
            if (t.closest && (t.closest('.bottom-nav') || t.closest('.modal') ||
                t.closest('.tab-buttons') || t.closest('.log-container') ||
                t.closest('select') || t.closest('textarea') || t.closest('input'))) {
                tracking = false;
                return;
            }
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
        }, { passive: true });
        swipeArea.addEventListener('touchend', (e) => {
            if (!tracking) return;
            tracking = false;
            // Don't switch tabs while a modal is open
            const openModal = Array.from(document.querySelectorAll('.modal'))
                .some(m => m.style.display === 'block');
            if (openModal) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            // Horizontal swipe only: enough X travel, and mostly horizontal
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            const current = document.querySelector('.main-tab-pane.active');
            if (!current) return;
            let idx = tabOrder.indexOf(current.id);
            if (idx === -1) return;
            // Swipe left (dx<0) -> next tab; swipe right (dx>0) -> previous tab
            idx += dx < 0 ? 1 : -1;
            if (idx < 0 || idx >= tabOrder.length) return;
            activateTab(tabOrder[idx]);
        }, { passive: true });
    }
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
// Tab scroll indicator: show « / » when more tabs exist off-screen on either side
(function setupTabScrollIndicator() {
    function update(wrap) {
        const tabs = wrap.querySelector('.tab-buttons');
        if (!tabs) return;
        const maxScroll = tabs.scrollWidth - tabs.clientWidth;
        const canScroll = maxScroll > 2;
        const x = tabs.scrollLeft;
        wrap.classList.toggle('can-left', canScroll && x > 2);
        wrap.classList.toggle('can-right', canScroll && x < maxScroll - 2);
    }
    function updateAll() {
        document.querySelectorAll('.tab-buttons-wrap').forEach(update);
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
    window.addEventListener('resize', updateAll, { passive: true });
    // Re-measure when a tab/page becomes visible (clientWidth is 0 while hidden)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.nav-button') || e.target.closest('.tab-button')) {
            setTimeout(updateAll, 50);
        }
    });
    // Expose so other code can trigger a refresh after switching pages
    window.refreshTabIndicators = updateAll;
    // Layout may not be ready at init; re-measure shortly after load
    setTimeout(updateAll, 300);
    setTimeout(updateAll, 1000);
})();
