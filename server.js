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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.loginAttempts = 0; // Rastrear tentativas de login
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
          // Delay maior entre comandos (mínimo 4 segundos)
          await delay(command.delay || 4000);
          this.bot.chat(command.message);
          this.addLog(`📤 Comando: ${command.message}`, 'command');
        } else if (command.type === 'function') {
          await delay(command.delay || 1000);
          await command.function();
          this.addLog(`⚙️ Função executada`, 'info');
        }
      } catch (error) {
        this.addLog(`❌ Erro: ${error.message}`, 'error');
      }
    }
    
    this.isProcessingQueue = false;
  }

  addCommand(message, delayMs = 4000, priority = false) {
    const command = { type: 'chat', message, delay: delayMs };
    if (priority) {
      this.commandQueue.unshift(command);
    } else {
      this.commandQueue.push(command);
    }
    this.processCommandQueue();
  }

  getReconnectDelay() {
    // Aumentar delays para evitar antibot
    if (this.reconnectAttempts === 1) {
      return 90000; // 90 segundos na primeira tentativa
    }
    if (this.reconnectAttempts === 2) {
      return 60000; // 60 segundos na segunda
    }
    return 45000; // 45 segundos nas demais
  }

  async connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.bot) {
      this.disconnect();
    }
    
    this.status = 'connecting';
    this.updateStatus();
    this.addLog(`🔌 Conectando ao servidor...`, 'info');
    
    try {
      this.bot = mineflayer.createBot({
        host: this.config.servidor,
        port: this.config.port,
        username: this.config.nome,
        version: this.config.versao,
        auth: 'offline',
        checkTimeoutInterval: 120000, // 2 minutos de timeout
        keepAlive: true,
        // Opções para parecer mais humano
        viewDistance: 'normal',
        chatLengthLimit: 256
      });
      
      this.setupEventHandlers();
    } catch (error) {
      this.addLog(`❌ Erro: ${error.message}`, 'error');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    }
  }
  
  setupEventHandlers() {
    let loginSent = false;
    
    this.bot.on('login', () => {
      this.addLog(`✅ Conectado ao servidor!`, 'success');
      this.reconnectAttempts = 0;
      this.loginAttempts = 0;
      
      // Delay ANTES de enviar o login (crucial!)
      setTimeout(() => {
        if (!loginSent && this.bot && this.status === 'connecting') {
          loginSent = true;
          this.addLog(`🔐 Enviando comando de login...`, 'info');
          this.bot.chat(`/login ${this.config.senha}`);
        }
      }, 5000); // Espera 5 segundos antes de tentar logar
    });
    
    this.bot.on('spawn', async () => {
      this.addLog(`🎮 Bot spawnou no mundo!`, 'success');
      this.status = 'online';
      this.updateStatus();
      this.isRespawning = false;
      loginSent = false;
      
      // Delay maior após spawn (10 segundos)
      await delay(10000);
      
      this.addLog(`🚀 Iniciando sequência de comandos...`, 'info');
      
      // Comando /skyblock com delay maior
      this.addCommand('/skyblock', 8000);
      
      // Aguardar teleporte (12 segundos)
      await delay(12000);
      
      // Comando /home farm
      this.addCommand('/home farm', 8000);
      
      // Aguardar teleporte do home
      await delay(10000);
      
      // Comando /ac
      this.addCommand('/ac', 5000);
      
      this.addLog(`✨ Sequência inicial concluída!`, 'success');
    });
    
    this.bot.on('respawn', () => {
      this.addLog(`🔄 Bot respawnou`, 'warn');
      this.isRespawning = true;
      
      setTimeout(() => {
        this.isRespawning = false;
        this.addCommand('/ac', 6000);
      }, 10000);
    });
    
    this.bot.on('resourcePack', (url, hash) => {
      this.addLog(`📦 Resource pack solicitado, aceitando...`, 'info');
      setTimeout(() => {
        if (this.bot) {
          this.bot.acceptResourcePack();
          this.addLog(`✅ Resource pack aceito!`, 'success');
        }
      }, 3000);
    });
    
    this.bot.on('message', (message) => {
      const text = message.toString();
      this.addLog(`💬 ${text.substring(0, 100)}`, 'chat');
      
      // Detectar kick por antibot
      if (text.includes('ANTIBOT') || text.includes('logou muito rápido')) {
        this.addLog(`⚠️ Detectado kick por ANTIBOT!`, 'error');
        this.addLog(`⏳ Aguardando 2 minutos antes de reconectar...`, 'warn');
      }
      
      // Detectar quando o login foi bem sucedido
      if (text.includes('Login realizado') || text.includes('logado com sucesso')) {
        this.addLog(`✅ Login confirmado pelo servidor!`, 'success');
      }
    });
    
    this.bot.on('error', (err) => {
      this.addLog(`❌ Erro: ${err.message}`, 'error');
      if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
        this.handleDisconnect();
      }
    });
    
    this.bot.on('end', (reason) => {
      let reasonText = 'Razão desconhecida';
      if (reason) {
        try {
          reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
        } catch(e) { reasonText = 'Erro ao parsear'; }
      }
      this.addLog(`🔌 Desconectado: ${reasonText.substring(0, 200)}`, 'warn');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    });
    
    this.bot.on('kicked', (reason) => {
      let reasonText = 'Razão desconhecida';
      if (reason) {
        try {
          reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
        } catch(e) { reasonText = 'Erro ao parsear'; }
      }
      this.addLog(`👢 Kickado: ${reasonText.substring(0, 200)}`, 'error');
      this.status = 'offline';
      this.updateStatus();
      
      // Delay EXTRA longo após kick (2-3 minutos)
      const kickDelay = 120000; // 2 minutos
      this.addLog(`⏳ Aguardando ${kickDelay/1000} segundos antes de reconectar...`, 'warn');
      
      setTimeout(() => {
        this.handleDisconnect();
      }, kickDelay);
    });
  }
  
  handleDisconnect() {
    if (this.isReconnecting) {
      return;
    }
    
    if (!this.autoReconnect) {
      this.addLog(`🔒 Reconexão automática desativada`, 'info');
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.addLog(`❌ Máximo de ${this.maxReconnectAttempts} tentativas atingido.`, 'error');
      this.addLog(`💡 Clique em START manualmente para tentar novamente.`, 'info');
      this.status = 'offline';
      this.updateStatus();
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delayMs = this.getReconnectDelay();
    const delaySeconds = delayMs / 1000;
    
    this.addLog(`🔄 Tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts}`, 'warn');
    this.addLog(`⏱️ Aguardando ${delaySeconds} segundos...`, 'info');
    
    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      this.addLog(`🔄 Reconectando (tentativa ${this.reconnectAttempts})...`, 'info');
      this.connect();
    }, delayMs);
  }
  
  disconnect() {
    this.autoReconnect = false;
    
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
    this.addLog(`⏹️ Bot parado manualmente`, 'info');
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }
  
  manualStart() {
    this.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.addLog(`🔄 Reinicialização manual solicitada`, 'info');
    this.connect();
  }
  
  sendCommand(command) {
    if (this.bot && this.status === 'online' && !this.isRespawning) {
      setTimeout(() => {
        if (this.bot && this.status === 'online') {
          this.bot.chat(command);
          this.addLog(`📤 Comando manual: ${command}`, 'command');
        }
      }, 1500);
      return true;
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
      reconnectAttempts: this.reconnectAttempts
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
    bot.manualStart();
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('📡 Cliente conectado');
  
  const allStats = Array.from(bots.values()).map(bot => bot.getStats());
  socket.emit('initialData', allStats);
  
  socket.on('disconnect', () => {
    console.log('📡 Cliente desconectado');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Dashboard: http://localhost:${PORT}`);
  console.log(`\n🤖 Configuração ANTI-ANTIBOT:`);
  console.log(`   - Delay antes do login: 5 segundos`);
  console.log(`   - Delay entre comandos: 4-8 segundos`);
  console.log(`   - Delay pós-spawn: 10 segundos`);
  console.log(`   - Delay pós-kick: 2 minutos`);
  console.log(`   - Reconexão: 90s → 60s → 45s\n`);
});
