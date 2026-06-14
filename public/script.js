const socket = io();

// Estado dos bots
let bots = new Map();

// Cores de status
const statusColors = {
    online: 'green',
    offline: 'red',
    connecting: 'yellow'
};

const statusText = {
    online: 'Online',
    offline: 'Offline',
    connecting: 'Conectando...'
};

// Função para criar card do bot
function createBotCard(bot) {
    const statusColor = statusColors[bot.status] || 'gray';
    const statusText_ = statusText[bot.status] || 'Desconhecido';
    
    return `
        <div class="bg-gray-800 rounded-lg shadow-xl overflow-hidden border-2 border-${statusColor}-500 status-${bot.status} transition-all hover:scale-105" data-bot-id="${bot.id}">
            <div class="bg-gray-700 px-6 py-4 border-b border-gray-600">
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold text-white">
                        <i class="fas fa-user-robot text-${statusColor}-500"></i>
                        ${bot.nome}
                    </h2>
                    <span class="px-3 py-1 rounded-full text-xs font-bold bg-${statusColor}-500 text-white">
                        ${statusText_}
                    </span>
                </div>
            </div>
            <div class="p-6">
                <div class="mb-4 space-y-2">
                    <p class="text-gray-300 text-sm">
                        <i class="fas fa-server text-blue-400"></i>
                        Servidor: healtzcraft.com
                    </p>
                    <p class="text-gray-300 text-sm">
                        <i class="fas fa-code-branch text-purple-400"></i>
                        Versão: 1.21.4
                    </p>
                    ${bot.reconnectAttempts > 0 ? `
                        <p class="text-yellow-500 text-sm">
                            <i class="fas fa-sync-alt"></i>
                            Tentativas de reconexão: ${bot.reconnectAttempts}
                        </p>
                    ` : ''}
                </div>
                
                <div class="flex gap-2 mb-4">
                    <button onclick="controlBot(${bot.id}, 'start')" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg transition-all text-sm flex items-center justify-center gap-2" ${bot.status === 'online' ? 'disabled' : ''}>
                        <i class="fas fa-play"></i>
                        Iniciar
                    </button>
                    <button onclick="controlBot(${bot.id}, 'stop')" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-all text-sm flex items-center justify-center gap-2" ${bot.status === 'offline' ? 'disabled' : ''}>
                        <i class="fas fa-stop"></i>
                        Parar
                    </button>
                </div>
                
                <div class="mb-3">
                    <input type="text" id="command-${bot.id}" placeholder="Digite um comando..." class="w-full px-3 py-2 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" onkeypress="handleCommandKeyPress(event, ${bot.id})">
                    <button onclick="sendCommand(${bot.id})" class="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg transition-all text-sm flex items-center justify-center gap-2">
                        <i class="fas fa-paper-plane"></i>
                        Enviar Comando
                    </button>
                </div>
            </div>
            <div class="bg-gray-900 px-4 py-3 border-t border-gray-700">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs text-gray-400">
                        <i class="fas fa-history"></i>
                        Últimos Logs
                    </span>
                    <button onclick="clearLogs(${bot.id})" class="text-xs text-gray-500 hover:text-gray-300">
                        <i class="fas fa-trash"></i>
                        Limpar
                    </button>
                </div>
                <div id="logs-${bot.id}" class="log-container h-32 overflow-y-auto bg-gray-900 rounded text-xs space-y-1">
                    <div class="text-gray-500 text-center py-2">Aguardando logs...</div>
                </div>
            </div>
        </div>
    `;
}

// Função para adicionar log ao bot
function addLogToBot(botId, log) {
    const logsContainer = document.getElementById(`logs-${botId}`);
    if (!logsContainer) return;
    
    const logColors = {
        info: 'text-blue-400',
        error: 'text-red-400',
        success: 'text-green-400',
        warn: 'text-yellow-400',
        command: 'text-purple-400',
        chat: 'text-cyan-400'
    };
    
    const colorClass = logColors[log.type] || 'text-gray-400';
    const time = new Date(log.timestamp).toLocaleTimeString();
    
    const logElement = document.createElement('div');
    logElement.className = `${colorClass} text-xs border-b border-gray-700 pb-1`;
    logElement.innerHTML = `
        <span class="text-gray-500">[${time}]</span>
        <span>${escapeHtml(log.message)}</span>
    `;
    
    logsContainer.insertBefore(logElement, logsContainer.firstChild);
    
    // Remove logs antigos se necessário
    while (logsContainer.children.length > 50) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
}

// Função para adicionar log global
function addGlobalLog(message, type = 'info') {
    const globalLogs = document.getElementById('globalLogs');
    const logColors = {
        info: 'text-blue-400',
        error: 'text-red-400',
        success: 'text-green-400',
        warn: 'text-yellow-400'
    };
    
    const colorClass = logColors[type] || 'text-gray-400';
    const time = new Date().toLocaleTimeString();
    
    const logElement = document.createElement('div');
    logElement.className = `${colorClass} text-sm border-b border-gray-700 pb-2 mb-2`;
    logElement.innerHTML = `
        <span class="text-gray-500">[${time}]</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    globalLogs.insertBefore(logElement, globalLogs.firstChild);
    
    // Remove logs antigos se necessário
    while (globalLogs.children.length > 100) {
        globalLogs.removeChild(globalLogs.lastChild);
    }
}

// Função para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Função para controlar bot
async function controlBot(botId, action) {
    try {
        const response = await fetch(`/api/bot/${botId}/${action}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            addGlobalLog(`Bot ${botId}: ${data.message}`, 'success');
        } else {
            addGlobalLog(`Erro ao ${action} bot ${botId}: ${data.message}`, 'error');
        }
    } catch (error) {
        addGlobalLog(`Erro de conexão: ${error.message}`, 'error');
    }
}

// Função para enviar comando
async function sendCommand(botId) {
    const input = document.getElementById(`command-${botId}`);
    const command = input.value.trim();
    
    if (!command) return;
    
    try {
        const response = await fetch(`/api/bot/${botId}/say`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command })
        });
        const data = await response.json();
        
        if (data.success) {
            addGlobalLog(`Comando enviado para bot ${botId}: ${command}`, 'success');
            input.value = '';
        } else {
            addGlobalLog(`Erro ao enviar comando: ${data.message}`, 'error');
        }
    } catch (error) {
        addGlobalLog(`Erro de conexão: ${error.message}`, 'error');
    }
}

// Função para limpar logs
function clearLogs(botId) {
    const logsContainer = document.getElementById(`logs-${botId}`);
    if (logsContainer) {
        logsContainer.innerHTML = '<div class="text-gray-500 text-center py-2">Logs limpos</div>';
        addGlobalLog(`Logs do bot ${botId} limpos`, 'info');
    }
}

// Função para lidar com Enter no campo de comando
function handleCommandKeyPress(event, botId) {
    if (event.key === 'Enter') {
        sendCommand(botId);
    }
}

// Função para atualizar dashboard
function updateDashboard(botsData) {
    const botsGrid = document.getElementById('botsGrid');
    
    if (!botsData || botsData.length === 0) {
        botsGrid.innerHTML = '<div class="col-span-3 text-center text-gray-500">Nenhum bot encontrado</div>';
        return;
    }
    
    let html = '';
    botsData.forEach(bot => {
        bots.set(bot.id, bot);
        html += createBotCard(bot);
    });
    
    botsGrid.innerHTML = html;
}

// Socket event handlers
socket.on('connect', () => {
    addGlobalLog('Conectado ao servidor do dashboard', 'success');
});

socket.on('disconnect', () => {
    addGlobalLog('Desconectado do servidor do dashboard', 'error');
});

socket.on('initialData', (botsData) => {
    updateDashboard(botsData);
    addGlobalLog(`Dashboard inicializado com ${botsData.length} bots`, 'success');
});

socket.on('botStatus', (status) => {
    const bot = Array.from(bots.values()).find(b => b.id === status.id);
    if (bot) {
        bot.status = status.status;
        updateDashboard(Array.from(bots.values()));
        addGlobalLog(`Bot ${status.nome} está ${status.status}`, 
            status.status === 'online' ? 'success' : 
            status.status === 'connecting' ? 'warn' : 'error');
    }
});

socket.on('botLog', (data) => {
    addLogToBot(data.botId, data.log);
    
    // Adiciona logs importantes ao log global
    if (data.log.type === 'error' || data.log.type === 'success') {
        addGlobalLog(`[${data.botName}] ${data.log.message}`, data.log.type);
    }
});

// Botões de controle
document.getElementById('startAllBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots/startAll', { method: 'POST' });
        const data = await response.json();
        addGlobalLog(data.message, 'success');
    } catch (error) {
        addGlobalLog(`Erro ao iniciar todos: ${error.message}`, 'error');
    }
});

document.getElementById('stopAllBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots/stopAll', { method: 'POST' });
        const data = await response.json();
        addGlobalLog(data.message, 'success');
    } catch (error) {
        addGlobalLog(`Erro ao parar todos: ${error.message}`, 'error');
    }
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bots/stats');
        const data = await response.json();
        updateDashboard(data);
        addGlobalLog('Dashboard atualizado', 'info');
    } catch (error) {
        addGlobalLog(`Erro ao atualizar: ${error.message}`, 'error');
    }
});

// Auto-refresh a cada 10 segundos
setInterval(async () => {
    try {
        const response = await fetch('/api/bots/stats');
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        // Silently fail to avoid spam
    }
}, 10000);

// Inicialização
addGlobalLog('Dashboard carregado. Clique em "Iniciar Todos" para começar.', 'info');