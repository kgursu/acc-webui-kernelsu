// ACC Configuration Manager
document.addEventListener('DOMContentLoaded', function() {
    // Shared ACC namespace
    window.ACC = window.ACC || {};
    let accPath = (window.ACC && window.ACC.accPath) || null;

    // Enhanced command executor specifically for ACC
    async function executeAccCommand(args = [], timeout = 15000) {
        const pathsToTry = [
            accPath,
            '/data/adb/modules/acc/acc.sh',
            '/data/adb/vr25/acc/acc.sh',
            '/data/adb/ap/bin/acc',        // APatch / FolkPatch
            '/data/adb/vr25/acc/acc',
            '/data/adb/modules/acc/acc',
            '/dev/acc',
            '/data/adb/vr25/bin/acc',
            '/system/bin/acc',
            'acc' // Try PATH as last resort
        ].filter((path, index, self) => path && self.indexOf(path) === index);

        let lastError;

        for (const path of pathsToTry) {
            try {
                debugLog(`Trying ACC path: ${path} ${args.join(' ')}`, 'DEBUG');
                const result = await commandExecutor.exec(path, args, timeout);

                // If successful, update the accPath
                if (path !== accPath) {
                    accPath = path;
                    window.ACC = window.ACC || {};
                    window.ACC.accPath = path;
                    debugLog(`Discovered ACC at: ${path}`, 'INFO');
                }

                return result;
            } catch (e) {
                lastError = e;
                continue;
            }
        }

        throw new Error(`All ACC paths failed. Last error: ${lastError}`);
    }

    // Show settings panel when system verification is complete
    const originalVerifySystem = window.verifySystem;
    window.verifySystem = async function() {
        try {
            const result = await originalVerifySystem.apply(this, arguments);

            // If accPath wasn't set by the original verifySystem, discover it
            if (!window.ACC.accPath) {
                try {
                    const version = await commandExecutor.exec('acc', ['-v']);
                    window.ACC.accPath = 'acc';
                    debugLog(`Discovered ACC in PATH`, 'INFO');
                } catch (e) {
                    debugLog(`ACC not in PATH: ${e}`, 'DEBUG');
                }
            }

            document.getElementById('settings-panel').style.display = 'block';
            initializeConfigUI();
            return result;
        } catch (e) {
            showError(`System verification failed: ${e}`);
            logManager.error(`VerifySystem error: ${e}`);
            throw e;
        }
    };

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Initialize config UI
    function initializeConfigUI() {
        document.getElementById('settings-panel').classList.add('loading');

        Promise.all([
            loadCurrentConfig(),
            loadChargingSwitches()
        ]).finally(() => {
            document.getElementById('settings-panel').classList.remove('loading');
        });

        document.getElementById('load-config-btn').addEventListener('click', () => {
            document.getElementById('settings-panel').classList.add('loading');
            loadCurrentConfig().finally(() => {
                document.getElementById('settings-panel').classList.remove('loading');
            });
        });

        document.getElementById('save-config-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to save these settings?")) {
                document.getElementById('settings-panel').classList.add('loading');
                saveConfig().finally(() => {
                    document.getElementById('settings-panel').classList.remove('loading');
                });
            }
        });

        document.getElementById('reset-config-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to reset all settings to defaults?")) {
                document.getElementById('settings-panel').classList.add('loading');
                resetConfig().finally(() => {
                    document.getElementById('settings-panel').classList.remove('loading');
                });
            }
        });

        document.getElementById('save-profile-btn').addEventListener('click', async () => {
            const profileName = prompt("Enter profile name:");
            if (profileName && profileName.trim()) {
                try {
                    await commandExecutor.exec('mkdir', ['-p', '/data/adb/vr25/acc-data/profiles']);
                    const config = await executeAccCommand(['-s']);
                    await commandExecutor.exec('sh', ['-c', `echo '${config.replace(/'/g, "'\\''")}' > /data/adb/vr25/acc-data/profiles/${profileName.trim()}.conf`]);
                    showError(`Profile "${profileName}" saved successfully!`, 'success');
                    setTimeout(hideError, 3000);
                    logManager.info(`Profile ${profileName} saved`);
                } catch (e) {
                    showError(`Failed to save profile: ${e}`, 'error');
                    logManager.error(`Save profile error: ${e}`);
                }
            }
        });

        document.getElementById('load-profile-btn').addEventListener('click', async () => {
            const profileName = prompt("Enter profile name to load:");
            if (profileName && profileName.trim()) {
                try {
                    const profileConfig = await commandExecutor.exec('cat', [`/data/adb/vr25/acc-data/profiles/${profileName.trim()}.conf`]);
                    const lines = profileConfig.split('\n').filter(l => l.trim() && l.includes('='));
                    
                    for (const line of lines) {
                        await executeAccCommand(['-s', line.trim()]);
                    }
                    
                    await loadCurrentConfig();
                    showError(`Profile "${profileName}" loaded successfully!`, 'success');
                    setTimeout(hideError, 3000);
                    logManager.info(`Profile ${profileName} loaded`);
                    
                    try {
                        await commandExecutor.exec('pkill', ['-f', 'accd']);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await executeAccCommand(['--init']);
                    } catch (e) {
                        console.warn("Could not restart accd:", e);
                    }
                } catch (e) {
                    showError(`Failed to load profile: ${e}`, 'error');
                    logManager.error(`Load profile error: ${e}`);
                }
            }
        });

        document.getElementById('test-functionality-btn').addEventListener('click', async () => {
            if (!confirm("This will test ACC functionality by toggling charging on/off. Continue?")) return;
            
            showError("Testing ACC functionality...", 'info');
            try {
                await executeAccCommand(['-d']);
                await new Promise(resolve => setTimeout(resolve, 2000));
                const status1 = await executeAccCommand(['-i']);
                
                await executeAccCommand(['-e']);
                await new Promise(resolve => setTimeout(resolve, 2000));
                const status2 = await executeAccCommand(['-i']);
                
                if (status1.includes('Discharging') || status1.includes('Not charging')) {
                    showError("✅ ACC functionality test passed!", 'success');
                } else {
                    showError("⚠️ ACC test completed but results inconclusive. Check logs.", 'info');
                }
                
                setTimeout(hideError, 5000);
                logManager.info("Functionality test completed");
            } catch (e) {
                showError(`Functionality test failed: ${e}`, 'error');
                logManager.error(`Test error: ${e}`);
            }
        });
    }

    // Load current ACC configuration
    async function loadCurrentConfig() {
        try {
            const config = await executeAccCommand(['-s']);
            const configLines = config.split('\n').filter(line => line.trim());

            // Parse config
            const configMap = {};
            configLines.forEach(line => {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    configMap[match[1].trim()] = match[2].trim();
                }
            });
            document.getElementById('pause-capacity').value = configMap.pause_capacity || '';
            document.getElementById('resume-capacity').value = configMap.resume_capacity || '';
            document.getElementById('shutdown-capacity').value = configMap.shutdown_capacity || '';
            document.getElementById('capacity-mask').value = configMap.capacity_mask || 'false';
            document.getElementById('max-current').value = configMap.max_charging_current || '';
            document.getElementById('max-voltage').value = configMap.max_charging_voltage || '';
            document.getElementById('temp-level').value = configMap.temp_level || '0';
            document.getElementById('prioritize-idle').value = configMap.prioritize_batt_idle_mode || 'true';
            document.getElementById('force-off').value = configMap.force_off || 'false';
            document.getElementById('reboot-resume').value = configMap.reboot_resume || 'false';
            document.getElementById('reset-batt-stats-on-pause').value = configMap.reset_batt_stats_on_pause || 'false';
            document.getElementById('reset-batt-stats-on-plug').value = configMap.reset_batt_stats_on_plug || 'false';
            document.getElementById('reset-batt-stats-on-unplug').value = configMap.reset_batt_stats_on_unplug || 'false';
            document.getElementById('cooldown-capacity').value = configMap.cooldown_capacity || '101';
            document.getElementById('cooldown-temp').value = configMap.cooldown_temp || '45';
            document.getElementById('cooldown-current').value = configMap.cooldown_current || '';
            document.getElementById('cooldown-charge').value = configMap.cooldown_charge || '';
            document.getElementById('cooldown-pause').value = configMap.cooldown_pause || '';
            document.getElementById('charging-switch').value = configMap.charging_switch || '';
            document.getElementById('batt-status-override').value = configMap.batt_status_override || '';
            document.getElementById('idle-apps').value = configMap.idle_apps || '';
            document.getElementById('run-cmd-on-pause').value = configMap.run_cmd_on_pause || '';
            document.getElementById('apply-on-boot').value = configMap.apply_on_boot || '';
            document.getElementById('apply-on-plug').value = configMap.apply_on_plug || '';

            logManager.info("Configuration loaded into UI");
        } catch (e) {
            showError(`Failed to load configuration: ${e}`);
            logManager.error(`Config load error: ${e}`);
        }
    }

    // Load available charging switches
    async function loadChargingSwitches() {
        try {
            const switches = await executeAccCommand(['-s', 's::']);
            const switchSelect = document.getElementById('charging-switch');

            // Clear existing options except the first (Automatic)
            while (switchSelect.options.length > 1) {
                switchSelect.remove(1);
            }

            switches.split('\n').forEach(line => {
                if (line.trim()) {
                    const option = document.createElement('option');
                    option.value = line.split(' ')[0];
                    option.textContent = line;
                    switchSelect.appendChild(option);
                }
            });
        } catch (e) {
            console.error("Failed to load charging switches:", e);
            logManager.error(`Failed to load charging switches: ${e}`);
        }
    }

    // Save configuration to ACC
    async function saveConfig() {
        try {
            let commands = [];

            // Basic settings
            if (document.getElementById('pause-capacity').value) {
                commands.push(`pause_capacity=${document.getElementById('pause-capacity').value}`);
            }
            if (document.getElementById('resume-capacity').value) {
                commands.push(`resume_capacity=${document.getElementById('resume-capacity').value}`);
            }
            if (document.getElementById('shutdown-capacity').value) {
                commands.push(`shutdown_capacity=${document.getElementById('shutdown-capacity').value}`);
            }
            commands.push(`capacity_mask=${document.getElementById('capacity-mask').value}`);

            // Limits
            if (document.getElementById('max-current').value) {
                commands.push(`max_charging_current=${document.getElementById('max-current').value}`);
            }
            if (document.getElementById('max-voltage').value) {
                commands.push(`max_charging_voltage=${document.getElementById('max-voltage').value}`);
            }
            if (document.getElementById('temp-level').value) {
                commands.push(`temp_level=${document.getElementById('temp-level').value}`);
            }

            // Advanced settings
            commands.push(`prioritize_batt_idle_mode=${document.getElementById('prioritize-idle').value}`);
            commands.push(`force_off=${document.getElementById('force-off').value}`);
            commands.push(`reboot_resume=${document.getElementById('reboot-resume').value}`);
            commands.push(`reset_batt_stats_on_pause=${document.getElementById('reset-batt-stats-on-pause').value}`);
            commands.push(`reset_batt_stats_on_plug=${document.getElementById('reset-batt-stats-on-plug').value}`);
            commands.push(`reset_batt_stats_on_unplug=${document.getElementById('reset-batt-stats-on-unplug').value}`);

            // Cooldown settings
            if (document.getElementById('cooldown-capacity').value) {
                commands.push(`cooldown_capacity=${document.getElementById('cooldown-capacity').value}`);
            }
            if (document.getElementById('cooldown-temp').value) {
                commands.push(`cooldown_temp=${document.getElementById('cooldown-temp').value}`);
            }
            if (document.getElementById('cooldown-current').value) {
                commands.push(`cooldown_current=${document.getElementById('cooldown-current').value}`);
            }
            if (document.getElementById('cooldown-charge').value && document.getElementById('cooldown-pause').value) {
                commands.push(`cooldown_charge=${document.getElementById('cooldown-charge').value}`);
                commands.push(`cooldown_pause=${document.getElementById('cooldown-pause').value}`);
            }

            // Other settings
            if (document.getElementById('charging-switch').value) {
                commands.push(`charging_switch=${document.getElementById('charging-switch').value}`);
            }
            if (document.getElementById('batt-status-override').value) {
                commands.push(`batt_status_override=${document.getElementById('batt-status-override').value}`);
            }
            if (document.getElementById('idle-apps').value) {
                commands.push(`idle_apps=${document.getElementById('idle-apps').value}`);
            }
            if (document.getElementById('run-cmd-on-pause').value) {
                commands.push(`run_cmd_on_pause=${document.getElementById('run-cmd-on-pause').value}`);
            }
            if (document.getElementById('apply-on-boot').value) {
                commands.push(`apply_on_boot=${document.getElementById('apply-on-boot').value}`);
            }
            if (document.getElementById('apply-on-plug').value) {
                commands.push(`apply_on_plug=${document.getElementById('apply-on-plug').value}`);
            }

            // Execute all commands; executeAccCommand rejects on non-zero exit
            for (const cmd of commands) {
                try {
                    await executeAccCommand(['-s', cmd]);
                } catch (e) {
                    showError(`Failed to save: ${cmd}`);
                    logManager.error(`Config save failed at "${cmd}": ${e}`);
                    return;
                }
            }

            logManager.info("Configuration saved");
            showError("Configuration saved successfully!");
            setTimeout(hideError, 3000);

            // Restart accd - nohup+setsid prevents APatch/FolkPatch from killing it
            try {
                await commandExecutor.exec('su', ['-c', `sh -c 'nohup setsid ${accPath || 'acc'} -D restart >/dev/null 2>&1 &' &`]);
            } catch (e) {
                console.warn("Could not restart accd:", e);
            }
        } catch (e) {
            showError(`Failed to save configuration: ${e}`);
            logManager.error(`Config save error: ${e}`);
        }
    }

    // Reset configuration to defaults
    async function resetConfig() {
        try {
            await executeAccCommand(['-s', '--reset']);
            await loadCurrentConfig();
            logManager.info("Configuration reset to defaults");
            showError("Configuration reset to defaults!");
            setTimeout(hideError, 3000);

            // Restart accd - nohup+setsid prevents APatch/FolkPatch from killing it
            try {
                await commandExecutor.exec('su', ['-c', `sh -c 'nohup setsid ${accPath || 'acc'} -D restart >/dev/null 2>&1 &' &`]);
            } catch (e) {
                console.warn("Could not restart accd:", e);
            }
        } catch (e) {
            showError(`Failed to reset configuration: ${e}`);
            logManager.error(`Config reset error: ${e}`);
        }
    }

    // ---- Update channel management ----
    const CHANNEL_FILE = '/data/adb/vr25/acc-data/update-channel';
    const REPO_RAW = 'https://raw.githubusercontent.com/kgursu/acc-webui-kernelsu/dev';

    function channelJsonUrl(channel) {
        return channel === 'beta' ? `${REPO_RAW}/module-beta.json` : `${REPO_RAW}/module.json`;
    }

    async function loadChannelPreference() {
        try {
            const out = await commandExecutor.exec('cat', [CHANNEL_FILE]);
            const channel = (out || '').trim() === 'beta' ? 'beta' : 'stable';
            const sel = document.getElementById('update-channel-select');
            if (sel) sel.value = channel;
        } catch (e) {
            // file missing = stable default
            const sel = document.getElementById('update-channel-select');
            if (sel) sel.value = 'stable';
        }
    }

    async function applyChannel() {
        const sel = document.getElementById('update-channel-select');
        if (!sel) return;
        const channel = sel.value;
        const url = channelJsonUrl(channel);
        try {
            // persist choice
            await commandExecutor.exec('su', ['-c', `echo ${channel} > ${CHANNEL_FILE}`]);
            // rewrite updateJson line in module.prop for all known module paths
            const propPaths = [
                '/data/adb/modules/acc/module.prop',
                '/data/adb/vr25/acc/module.prop'
            ];
            for (const p of propPaths) {
                await commandExecutor.exec('su', ['-c',
                    `[ -f ${p} ] && sed -i 's|^updateJson=.*|updateJson=${url}|' ${p} || true`]);
            }
            showError(`Update channel set to ${channel}. Restart your root manager to refresh.`, 'info');
            logManager.info(`Update channel changed to ${channel} (${url})`);
        } catch (e) {
            showError(`Failed to set channel: ${e}`);
            logManager.error(`Channel change error: ${e}`);
        }
    }

    const applyChannelBtn = document.getElementById('apply-channel-btn');
    if (applyChannelBtn) {
        applyChannelBtn.addEventListener('click', applyChannel);
    }
    loadChannelPreference();
});