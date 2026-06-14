const socket = io({
    transports: ['websocket', 'polling']
});

let bots = new Map();

const statusIcons = {
    online: '●',
    offline: '○',
    connecting: '◐'
};

const statusClasses = {
    online: 'online',
    offline: 'offline',
    connecting: 'connecting'
};

function updateGlobalStats() {
    const botsArray = Array.from(bots.values());
    const online = botsArray.filter(b => b.status === 'online').length;
    const offline = botsArray.filter(b => b.status === 'offline').length;
    
    document.getElementById('onlineCount').textContent = online;
    document.getElementById('offlineCount').textContent = offline;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addGlobalLog(message, type = 'info') {
    const globalLogs = document.getElementById('globalLogs');
    const time = new Date().toLocaleTimeString();
    
    const logColors = {
        info: '#8892B0',
        error: '#FF0055',
        success: '#00FF9D',
        warn: '#FFB800'
    };
    
    const logDiv = document.createElement('div');
    logDiv.className = 'log-line';
    logDiv.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-message ${type}" style="color: ${logColors[type] || '#8892B0'}">
            > ${escapeHtml(message)}
        </span>
    `;
    
    globalLogs.insertBefore(logDiv, globalLogs.firstChild);
    
    while (globalLogs.children.length > 100) {
        globalLogs.removeChild(globalLogs.lastChild);
    }
}

function addBotLog(botId, log) {
    const logsContainer = document.getElementById(`logs-${botId}`);
    if (!logsContainer) return;
    
    const time = new Date(log.timestamp).toLocaleTimeString();
    const logColors = {
        info: '#8892B0',
        error: '#FF0055',
        success: '#00FF9D',
        warn: '#FFB800',
        command: '#00D4FF',
        chat: '#00FF9D'
    };
    
    const logDiv = document.createElement('div');
    logDiv.className = 'log-line';
    logDiv.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-message ${log.type}" style="color: ${logColors[log.type] || '#8892B0'}">
            ${escapeHtml(log.message)}
        </span>
    `;
    
    logsContainer.insertBefore(logDiv, logsContainer.firstChild);
    
    while (logsContainer.children.length > 50) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
}

function createBotCard(bot) {
    const statusClass = statusClasses[bot.status] || 'offline';
    const statusIcon = statusIcons[bot.status] || '?';
    const statusText = {
        online: 'ONLINE',
        offline: 'OFFLINE',
        connecting: 'CONNECTING'
    }[bot.status] || 'UNKNOWN';
    
    return `
        <div class="terminal-card ${statusClass}" data-bot-id="${bot.id}">
            <div class="terminal-header">
                <div class="bot-name">
                    <span class="status-led ${statusClass}"></span>
                    <span>${escapeHtml(bot.nome)}</span>
                </div>
                <div class="status-text" style="color: ${statusClass === 'online' ? '#00FF9D' : statusClass === 'connecting' ? '#00D4FF' : '#FF0055'}">
                    ${statusIcon} ${statusText}
                </div>
            </div>
            
            <div class="terminal-body">
                <div class="info-row">
                    <span class="info-label">SERVER</span>
                    <span class="info-value">healtzcraft.com</span>
                </div>
                <div class="info-row">
                    <span class="info-label">VERSION</span>
                    <span class="info-value">1.21.4</span>
                </div>
                ${bot.reconnectAttempts > 0 ? `
                <div class="info-row">
                    <span class="info-label">RECONNECT_ATTEMPTS</span>
                    <span class="info-value" style="color:#FFB800">${bot.reconnectAttempts}/10</span>
                </div>
                ` : ''}
                
                <div class="bot-actions">
                    <button class="btn-bot start" onclick="controlBot(${bot.id}, 'start')" ${bot.status === 'online' ? 'disabled' : ''}>
                        ▶ START
                    </button>
                    <button class="btn-bot stop" onclick="controlBot(${bot.id}, 'stop')" ${bot.status === 'offline' ? 'disabled' : ''}>
                        ■ STOP
                    </button>
                </div>
                
                <div class="command-section">
                    <div class="command-input-group">
                        <input type="text" id="command-${bot.id}" class="command-input" placeholder=">_ ENTER_COMMAND" onkeypress="handleCommandKeyPress(event, ${bot.id})">
                        <button class="btn-small btn-secondary" onclick="sendCommand(${bot.id})">
                            EXEC
                        </button>
                    </div>
                </div>
                
                <div class="logs-container" id="logs-${bot.id}">
                    <div class="log-line">
                        <span class="log-time">[System]</span>
                        <span class="log-message">> Waiting for bot connection...</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateDashboard(botsData) {
    const botsGrid = document.getElementById('botsGrid');
    
    if (!botsData || botsData.length === 0) {
        botsGrid.innerHTML = '<div style="text-align: center; padding: 60px; color: #5A6A8A;">NO_BOTS_FOUND</div>';
        return;
    }
    
    let html = '';
    botsData.forEach(bot => {
        bots.set(bot.id, bot);
        html += createBotCard(bot);
    });
    
    botsGrid.innerHTML = html;
    updateGlobalStats();
}

async function controlBot(botId, action) {
    try {
        const response = await fetch(`/api/bot/${botId}/${action}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            addGlobalLog(`BOT_${botId}: ${data.message}`, 'success');
        } else {
            addGlobalLog(`ERROR_BOT_${botId}: ${data.message}`, 'error');
        }
    } catch (error) {
        addGlobalLog(`CONNECTION_ERROR: ${error.message}`, 'error');
    }
}

async function sendCommand(botId) {
    const input = document.getElementById(`command-${botId}`);
    const command = input.value.trim();
    
    if (!command) return;
    
    try {
        const response = await fetch(`/api/bot/${botId}/say`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        const data = await response.json();
        
        if (data.success) {
            addGlobalLog(`CMD_SENT_BOT_${botId}: ${command}`, 'success');
            input.value = '';
        } else {
            addGlobalLog(`CMD_FAILED_BOT_${botId}: ${data.message}`, 'error');
        }
    } catch (error) {
        addGlobalLog(`CONNECTION_ERROR: ${error.message}`, 'error');
    }
}

function handleCommandKeyPress(event, botId) {
    if (event.key === 'Enter') {
        sendCommand(botId);
    }
}

// Socket events
socket.on('connect', () => {
    addGlobalLog('WEBSOCKET_CONNECTED', 'success');
});

socket.on('disconnect', () => {
    addGlobalLog('WEBSOCKET_DISCONNECTED', 'error');
});

socket.on('initialData', (botsData) => {
    updateDashboard(botsData);
    addGlobalLog(`INITIALIZED: ${botsData.length} bots loaded`, 'success');
});

socket.on('botStatus', (status) => {
    const bot = Array.from(bots.values()).find(b => b.id === status.id);
    if (bot) {
        bot.status = status.status;
        bot.reconnectAttempts = status.reconnectAttempts || 0;
        updateDashboard(Array.from(bots.values()));
        addGlobalLog(`BOT_${status.nome}: STATUS_${status.status.toUpperCase()}`, 
            status.status === 'online' ? 'success' : 
            status.status === 'connecting' ? 'warn' : 'error');
    }
});

socket.on('botLog', (data) => {
    addBotLog(data.botId, data.log);
    
    if (data.log.type === 'error') {
        addGlobalLog(`[${data.botName}] ${data.log.message}`, 'error');
    } else if (data.log.type === 'success') {
        addGlobalLog(`[${data.botName}] ${data.log.message}`, 'success');
    }
});

// UI Controls
document.getElementById('startAllBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots/startAll', { method: 'POST' });
        const data = await response.json();
        addGlobalLog(data.message, 'success');
    } catch (error) {
        addGlobalLog(`ERROR: ${error.message}`, 'error');
    }
});

document.getElementById('stopAllBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots/stopAll', { method: 'POST' });
        const data = await response.json();
        addGlobalLog(data.message, 'success');
    } catch (error) {
        addGlobalLog(`ERROR: ${error.message}`, 'error');
    }
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots/stats');
        const data = await response.json();
        updateDashboard(data);
        addGlobalLog('MANUAL_REFRESH_COMPLETE', 'info');
    } catch (error) {
        addGlobalLog(`REFRESH_ERROR: ${error.message}`, 'error');
    }
});

// Auto refresh
setInterval(async () => {
    try {
        const response = await fetch('/api/bots/stats');
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        // Silently fail
    }
}, 10000);

addGlobalLog('READY | Use START ALL to begin', 'success');
