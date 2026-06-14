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
  }
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
  }

  addLog(message, type = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type
    };
    this.logs.unshift(logEntry);
    if (this.logs.length > 100) this.logs.pop();
    
    // Emit log via socket
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
          this.bot.chat(command.message);
          this.addLog(`Executando comando: ${command.message}`, 'command');
          await delay(command.delay || 0);
        } else if (command.type === 'function') {
          await command.function();
          await delay(command.delay || 0);
        }
      } catch (error) {
        this.addLog(`Erro ao executar comando: ${error.message}`, 'error');
      }
    }
    
    this.isProcessingQueue = false;
  }

  addCommand(message, delayMs = 2000) {
    this.commandQueue.push({ type: 'chat', message, delay: delayMs });
    this.processCommandQueue();
  }

  async connect() {
    if (this.bot) {
      this.disconnect();
    }
    
    this.status = 'connecting';
    this.updateStatus();
    this.addLog(`Conectando ao servidor ${this.config.servidor}...`, 'info');
    
    try {
      this.bot = mineflayer.createBot({
        host: this.config.servidor,
        port: this.config.port,
        username: this.config.nome,
        version: this.config.versao,
        auth: 'offline'
      });
      
      this.setupEventHandlers();
    } catch (error) {
      this.addLog(`Erro ao criar bot: ${error.message}`, 'error');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    }
  }
  
  setupEventHandlers() {
    this.bot.on('login', () => {
      this.addLog(`Login realizado com sucesso!`, 'success');
      this.reconnectAttempts = 0;
      this.addCommand(`/login ${this.config.senha}`, 2000);
      
      // Aguarda 2 segundos após login
      setTimeout(() => {
        this.addCommand('/skyblock', 2500);
      }, 2000);
    });
    
    this.bot.on('spawn', () => {
      this.addLog(`Bot spawnou no jogo!`, 'success');
      this.status = 'online';
      this.updateStatus();
      
      // Executa comandos pós-spawn
      setTimeout(() => {
        this.addCommand('/home farm', 2500);
        setTimeout(() => {
          this.addCommand('/ac', 1000);
        }, 2500);
      }, 2000);
    });
    
    this.bot.on('resourcePack', (url, hash) => {
      this.addLog(`Resource pack solicitado, aceitando automaticamente...`, 'info');
      this.bot.acceptResourcePack();
    });
    
    this.bot.on('message', (message) => {
      const text = message.toString();
      this.addLog(`Mensagem: ${text}`, 'chat');
    });
    
    this.bot.on('error', (err) => {
      this.addLog(`Erro: ${err.message}`, 'error');
      this.status = 'offline';
      this.updateStatus();
    });
    
    this.bot.on('end', (reason) => {
      this.addLog(`Desconectado: ${reason || 'Razão desconhecida'}`, 'warn');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    });
    
    this.bot.on('kicked', (reason) => {
      this.addLog(`Kickado: ${reason}`, 'error');
      this.status = 'offline';
      this.updateStatus();
      this.handleDisconnect();
    });
  }
  
  handleDisconnect() {
    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.addLog(`Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay/1000}s`, 'warn');
      
      setTimeout(() => {
        if (this.autoReconnect) {
          this.connect();
        }
      }, delay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.addLog(`Número máximo de tentativas de reconexão atingido`, 'error');
      this.status = 'offline';
      this.updateStatus();
    }
  }
  
  disconnect() {
    this.autoReconnect = false;
    if (this.bot) {
      this.bot.end();
      this.bot = null;
    }
    this.status = 'offline';
    this.updateStatus();
    this.addLog(`Bot desconectado manualmente`, 'info');
  }
  
  sendCommand(command) {
    if (this.bot && this.status === 'online') {
      this.bot.chat(command);
      this.addLog(`Comando manual enviado: ${command}`, 'command');
      return true;
    }
    return false;
  }
  
  updateStatus() {
    io.emit('botStatus', {
      id: this.id,
      nome: this.config.nome,
      status: this.status
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
    bot.autoReconnect = true;
    bot.connect();
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
    bot.autoReconnect = true;
    bot.connect();
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Cliente conectado ao dashboard');
  
  // Envia status atual de todos os bots
  const allStats = Array.from(bots.values()).map(bot => bot.getStats());
  socket.emit('initialData', allStats);
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado do dashboard');
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dashboard rodando em http://localhost:${PORT}`);
  console.log('Sistema de bots pronto para iniciar os bots via dashboard');
});