const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mineflayer = require('mineflayer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração dos bots pré-configurados
const botsConfig = [
  {
    id: 1,
    nome: "GatoDoMato_",
    servidor: "healtzcraft.com",
    versao: "1.21.4",
    senha: "250719802023",
    port: 25565
  },
  {
    id: 2,
    nome: "npx_DevCraft",
    servidor: "healtzcraft.com",
    versao: "1.21.4",
    senha: "250719802023",
    port: 25565
  },
  {
    id: 3,
    nome: "npm_install",
    servidor: "healtzcraft.com",
    versao: "1.21.4",
    senha: "250719802023",
    port: 25565
  }
];

// Gerenciamento dos bots
const bots = new Map();
const botLogs = new Map();

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (baseMs, variationMs = 500) => delay(baseMs + Math.random() * variationMs);

class BotManager {
  constructor(config) {
    this.id = config.id;
    this.config = config;
    this.bot = null;
    this.status = 'offline';
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.logs = [];
    this.isRespawning = false;
    this.reconnectTimer = null; // Timer para reconexão
    this.isReconnecting = false; // Flag para evitar múltiplas tentativas
  }

  addLog(message, type = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type
    };
    this.logs.unshift(logEntry);
    if (this.logs.length > 100) this.logs.pop();
    
    io.emit('botLog', {
      botId: this.id,
      botName: this.config.nome,
      log: logEntry
    });
    
    console.log(`[${new Date().toLocaleTimeString()}] [Bot ${this.config.nome}] ${message}`);
  }

  async processCommandQueue() {
    if (this.isProcessingQueue || !this.bot || this.status !== 'online') return;
    this.isProcessingQueue = true;
    
    while (this.commandQueue.length > 0 && this.bot && this.status === 'online') {
      const command = this.commandQueue.shift();
      try {
        if (command.type === 'chat') {
          await randomDelay(command.delay || 3000);
          this.bot.chat(command.message);
          this.addLog(`📤 Comando: ${command.message}`, 'command');
        } else if (command.type === 'function') {
          await randomDelay(command.delay || 1000);
          await command.function();
          this.addLog(`⚙️ Função executada: command.name || 'desconhecida'`, 'info');
        }
      } catch (error) {
        this.addLog(`❌ Erro ao executar comando: ${error.message}`, 'error');
      }
    }
    
    this.isProcessingQueue = false;
  }

  addCommand(message, delayMs = 3000, priority = false) {
    const command = { type: 'chat', message, delay: delayMs };
    if (priority) {
      this.commandQueue.unshift(command);
    } else {
      this.commandQueue.push(command);
    }
    this.processCommandQueue();
  }

  // Calcula o delay baseado no número de tentativas
  getReconnectDelay() {
    // Primeira tentativa: 60 segundos
    if (this.reconnectAttempts === 1) {
      return 60000; // 1 minuto
    }
    // Tentativas seguintes: 30 segundos
    return 30000; // 30 segundos
  }

  async connect() {
    // Limpa qualquer timer pendente
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.bot) {
      this.disconnect();
    }
    
    this.status = 'connecting';
    this.updateStatus();
    this.addLog(`🔌 Conectando ao servidor ${this.config.servidor}...`, 'info');
    
    try {
      this.bot = mineflayer.createBot({
        host: this.config.servidor,
        port: this.config.port,
        username: this.config.nome,
        version: this.config.versao,
        auth: 'offline',
        checkTimeoutInterval: 60000,
        keepAlive: true
      });
      
      this.setupEventHandlers();
    } catch (error) {
      this.addLog(`❌ Erro ao criar bot: ${error.message}`, 'error');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    }
  }
  
  setupEventHandlers() {
    this.bot.on('login', () => {
      this.addLog(`✅ Login realizado com sucesso!`, 'success');
      this.reconnectAttempts = 0; // Reset contador ao conectar com sucesso
      this.isReconnecting = false;
      
      setTimeout(() => {
        this.addCommand(`/login ${this.config.senha}`, 3000);
      }, 2000);
    });
    
    this.bot.on('spawn', async () => {
      this.addLog(`🎮 Bot spawnou no jogo!`, 'success');
      this.status = 'online';
      this.updateStatus();
      this.isRespawning = false;
      
      await randomDelay(4000);
      this.addCommand('/skyblock', 5000);
      await randomDelay(8000);
      this.addCommand('/home farm', 6000);
      await randomDelay(7000);
      this.addCommand('/ac', 3000);
      
      this.addLog(`✨ Sequência inicial de comandos concluída!`, 'success');
    });
    
    this.bot.on('respawn', () => {
      this.addLog(`🔄 Bot respawnou, aguardando para executar comandos...`, 'warn');
      this.isRespawning = true;
      
      setTimeout(() => {
        this.isRespawning = false;
        this.addCommand('/ac', 4000);
        this.addLog(`✨ Comandos pós-respawn executados`, 'success');
      }, 8000);
    });
    
    this.bot.on('resourcePack', (url, hash) => {
      this.addLog(`📦 Resource pack solicitado, aceitando em 2 segundos...`, 'info');
      setTimeout(() => {
        if (this.bot) {
          this.bot.acceptResourcePack();
          this.addLog(`✅ Resource pack aceito!`, 'success');
        }
      }, 2000);
    });
    
    this.bot.on('message', (message) => {
      const text = message.toString();
      this.addLog(`💬 ${text}`, 'chat');
      
      if (text.includes('kicked') || text.includes('Kicked')) {
        this.addLog(`⚠️ Bot foi kickado! Aguardando reconexão...`, 'error');
      }
      
      if (text.includes('teleport') || text.includes('Teleporting')) {
        this.addLog(`🌀 Teleporte detectado, aguardando estabilização...`, 'info');
      }
    });
    
    this.bot.on('error', (err) => {
      this.addLog(`❌ Erro: ${err.message}`, 'error');
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        this.addLog(`🔌 Problema de conexão, tentando reconectar...`, 'warn');
        this.status = 'offline';
        this.updateStatus();
        this.handleDisconnect();
      }
    });
    
    this.bot.on('end', (reason) => {
      this.addLog(`🔌 Desconectado: ${reason || 'Razão desconhecida'}`, 'warn');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    });
    
    this.bot.on('kicked', (reason) => {
      this.addLog(`👢 Kickado: ${reason}`, 'error');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    });
  }
  
  handleDisconnect() {
    // Evita múltiplas tentativas simultâneas
    if (this.isReconnecting) {
      this.addLog(`⏳ Já existe uma tentativa de reconexão em andamento...`, 'warn');
      return;
    }
    
    // Se desconexão foi manual, não reconecta
    if (!this.autoReconnect) {
      this.addLog(`🔒 Reconexão automática desativada`, 'info');
      return;
    }
    
    // Verifica limite de tentativas
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.addLog(`❌ Número máximo de tentativas (${this.maxReconnectAttempts}) atingido.`, 'error');
      this.addLog(`💡 Clique em "Iniciar" manualmente para tentar novamente.`, 'info');
      this.status = 'offline';
      this.updateStatus();
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delayMs = this.getReconnectDelay();
    const delaySeconds = delayMs / 1000;
    
    this.addLog(`🔄 Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts}`, 'warn');
    this.addLog(`⏱️ Aguardando ${delaySeconds} segundos antes de tentar novamente...`, 'info');
    
    // Agenda a reconexão
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      this.addLog(`🔄 Iniciando tentativa de reconexão ${this.reconnectAttempts}...`, 'info');
      this.connect();
    }, delayMs);
  }
  
  disconnect() {
    this.autoReconnect = false;
    
    // Limpa timer pendente
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.bot) {
      this.bot.end();
      this.bot = null;
    }
    
    this.status = 'offline';
    this.updateStatus();
    this.addLog(`⏹️ Bot desconectado manualmente`, 'info');
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }
  
  // Método para resetar e iniciar manualmente
  manualStart() {
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.connect();
  }
  
  sendCommand(command) {
    if (this.bot && this.status === 'online' && !this.isRespawning) {
      setTimeout(() => {
        if (this.bot && this.status === 'online') {
          this.bot.chat(command);
          this.addLog(`📤 Comando manual: ${command}`, 'command');
        }
      }, 1000);
      return true;
    } else if (this.isRespawning) {
      this.addLog(`⏳ Bot está respawnando, aguarde alguns segundos`, 'warn');
      return false;
    }
    return false;
  }
  
  updateStatus() {
    io.emit('botStatus', {
      id: this.id,
      nome: this.config.nome,
      status: this.status,
      reconnectAttempts: this.reconnectAttempts
    });
  }
  
  getStats() {
    return {
      id: this.id,
      nome: this.config.nome,
      status: this.status,
      logs: this.logs.slice(0, 50),
      reconnectAttempts: this.reconnectAttempts,
      nextReconnectDelay: this.autoReconnect && this.reconnectAttempts > 0 ? this.getReconnectDelay() : null
    };
  }
}

// Inicializa os bots
botsConfig.forEach(config => {
  const botManager = new BotManager(config);
  bots.set(config.id, botManager);
  botLogs.set(config.id, []);
});

// API Endpoints
app.get('/api/bots', (req, res) => {
  const botsList = Array.from(bots.values()).map(bot => ({
    id: bot.id,
    nome: bot.config.nome,
    status: bot.status,
    reconnectAttempts: bot.reconnectAttempts
  }));
  res.json(botsList);
});

app.get('/api/bots/stats', (req, res) => {
  const stats = Array.from(bots.values()).map(bot => bot.getStats());
  res.json(stats);
});

app.post('/api/bot/:id/start', (req, res) => {
  const bot = bots.get(parseInt(req.params.id));
  if (bot) {
    bot.manualStart(); // Usa o novo método manualStart
    res.json({ success: true, message: `Bot ${bot.config.nome} iniciando` });
  } else {
    res.status(404).json({ success: false, message: 'Bot não encontrado' });
  }
});

app.post('/api/bot/:id/stop', (req, res) => {
  const bot = bots.get(parseInt(req.params.id));
  if (bot) {
    bot.disconnect();
    res.json({ success: true, message: `Bot ${bot.config.nome} parado` });
  } else {
    res.status(404).json({ success: false, message: 'Bot não encontrado' });
  }
});

app.post('/api/bot/:id/say', (req, res) => {
  const bot = bots.get(parseInt(req.params.id));
  const { command } = req.body;
  if (bot && command) {
    const success = bot.sendCommand(command);
    res.json({ success, message: success ? 'Comando enviado' : 'Bot não está online' });
  } else {
    res.status(400).json({ success: false, message: 'Dados inválidos' });
  }
});

app.post('/api/bots/startAll', (req, res) => {
  bots.forEach(bot => {
    bot.manualStart();
  });
  res.json({ success: true, message: 'Todos os bots iniciando' });
});

app.post('/api/bots/stopAll', (req, res) => {
  bots.forEach(bot => {
    bot.disconnect();
  });
  res.json({ success: true, message: 'Todos os bots parados' });
});

app.get('/api/logs/:id', (req, res) => {
  const bot = bots.get(parseInt(req.params.id));
  if (bot) {
    res.json(bot.logs.slice(0, 100));
  } else {
    res.status(404).json({ success: false, message: 'Bot não encontrado' });
  }
});

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('📡 Cliente conectado ao dashboard');
  
  const allStats = Array.from(bots.values()).map(bot => bot.getStats());
  socket.emit('initialData', allStats);
  
  socket.on('disconnect', () => {
    console.log('📡 Cliente desconectado');
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Dashboard rodando em http://localhost:${PORT}`);
  console.log(`📊 Sistema de bots pronto! Use o dashboard para controlar os bots.\n`);
  console.log(`🤖 Bots configurados:`);
  botsConfig.forEach(bot => {
    console.log(`   - ${bot.nome} (${bot.servidor})`);
  });
  console.log(`\n🔄 Sistema de reconexão:`);
  console.log(`   - 1ª tentativa: 60 segundos`);
  console.log(`   - Demais tentativas: 30 segundos`);
  console.log(`   - Máximo: 10 tentativas`);
  console.log(`\n💡 Dica: Clique em "Iniciar Todos" no dashboard para começar.\n`);
});
