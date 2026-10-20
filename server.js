const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GE_URL = 'https://ge.globo.com/futebol/brasileirao-serie-a/';
const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'tabela.json');

// Intervalo de verificação automática do GE (em milissegundos)
const POLLING_INTERVAL_MS = 30 * 1000; // 30 segundos

// Armazena conexões ativas de Server-Sent Events (SSE)
const sseClients = new Set();

// Último hash/snapshot conhecido dos dados para detecção de alterações
let ultimoSnapshotJson = '';
let dadosEmMemoria = null;

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Extrai os dados diretamente da estrutura HTML do GE
async function fetchTabelaDoGE() {
  return new Promise((resolve, reject) => {
    const req = https.get(GE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Erro ao acessar GE: status ${res.statusCode}`));
      }

      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          // Extrai o bloco JSON 'const classificacao = {...};' da estrutura da página
          const match = html.match(/const\s+classificacao\s*=\s*(\{[\s\S]*?\});/);
          if (!match || !match[1]) {
            return reject(new Error('Estrutura da tabela não encontrada na página do GE'));
          }

          const parsed = JSON.parse(match[1]);
          if (!parsed.classificacao || !Array.isArray(parsed.classificacao)) {
            return reject(new Error('Formato inesperado dos dados de classificação'));
          }

          // Filtra mantendo apenas os campos essenciais solicitados (P, J, V e identificação do time)
          const times = parsed.classificacao.map(item => ({
            ordem: item.ordem,
            time: item.nome_popular,
            sigla: item.sigla,
            escudo: item.escudo,
            pontos: item.pontos,      // P
            jogos: item.jogos,        // J
            vitorias: item.vitorias,  // V
            variacao: item.variacao,
            faixaCor: item.faixa_classificacao_cor || (item.faixa_classificacao && item.faixa_classificacao.cor) || '#888'
          }));

          const resultado = {
            origem: GE_URL,
            atualizadoEm: new Date().toISOString(),
            totalTimes: times.length,
            classificacao: times
          };

          // Salva no cache local
          fs.writeFileSync(CACHE_FILE, JSON.stringify(resultado, null, 2), 'utf8');
          dadosEmMemoria = resultado;
          resolve(resultado);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Timeout ao conectar com o GE'));
    });
  });
}

// Obtém os dados (da memória/cache ou direto do GE)
async function getDadosTabela(forceRefresh = false) {
  if (!forceRefresh && dadosEmMemoria) {
    return dadosEmMemoria;
  }

  if (!forceRefresh && fs.existsSync(CACHE_FILE)) {
    try {
      const stats = fs.statSync(CACHE_FILE);
      const cacheAgeMs = Date.now() - stats.mtimeMs;
      if (cacheAgeMs < 10 * 60 * 1000) {
        dadosEmMemoria = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return dadosEmMemoria;
      }
    } catch (e) {
      console.warn('Erro ao ler cache, buscando online:', e.message);
    }
  }

  try {
    const dados = await fetchTabelaDoGE();
    return dados;
  } catch (err) {
    if (dadosEmMemoria) return dadosEmMemoria;
    if (fs.existsSync(CACHE_FILE)) {
      dadosEmMemoria = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      return dadosEmMemoria;
    }
    throw err;
  }
}

// Transmite novos dados para todos os clientes conectados via Server-Sent Events
function broadcastSSE(dados) {
  if (sseClients.size === 0) return;

  const payload = `event: tabela\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
  console.log(`📢 Atualização SSE transmitida para ${sseClients.size} cliente(s) ativo(s).`);
}

// Checagem periódica em segundo plano para capturar atualizações no GE
async function verificarAtualizacoesNoGE() {
  try {
    const dados = await fetchTabelaDoGE();
    const snapshotAtual = JSON.stringify(dados.classificacao.map(t => `${t.ordem}:${t.sigla}:${t.pontos}:${t.jogos}:${t.vitorias}`));

    // Se houve mudança no ranking ou nos valores de P, J, V
    if (snapshotAtual !== ultimoSnapshotJson) {
      console.log('⚡ Mudança detectada na tabela do GE! Enviando evento aos clientes...');
      ultimoSnapshotJson = snapshotAtual;
      broadcastSSE(dados);
    }
  } catch (err) {
    console.warn('⚠️ Falha temporária na verificação periódica do GE:', err.message);
  }
}

// Inicia monitoramento periódico
setInterval(verificarAtualizacoesNoGE, POLLING_INTERVAL_MS);

// Envio de heartbeat / ping a cada 20 segundos para manter conexões SSE ativas
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 20000);

// Tipos MIME para arquivos estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Habilita CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Endpoint de Server-Sent Events (SSE)
  if (reqUrl.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(': conexao estabelecida\n\n');
    sseClients.add(res);
    console.log(`🔌 Novo cliente SSE conectado. Total de clientes: ${sseClients.size}`);

    // Envia os dados atuais imediatamente para o novo cliente
    try {
      const dadosAtuais = await getDadosTabela(false);
      res.write(`event: tabela\ndata: ${JSON.stringify(dadosAtuais)}\n\n`);
    } catch (e) {
      console.warn('Erro ao enviar estado inicial SSE:', e.message);
    }

    req.on('close', () => {
      sseClients.delete(res);
      console.log(`🔌 Cliente SSE desconectado. Restantes: ${sseClients.size}`);
    });
    return;
  }

  // Endpoint REST da Tabela
  if (reqUrl.pathname === '/api/tabela') {
    const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
    try {
      const dados = await getDadosTabela(forceRefresh);
      if (forceRefresh) {
        broadcastSSE(dados);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify(dados));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ erro: 'Não foi possível obter a tabela do GE', detalhe: err.message }));
    }
    return;
  }

  // Arquivos estáticos do frontend
  const decodedPath = decodeURIComponent(reqUrl.pathname);
  let filePath = path.join(__dirname, decodedPath === '/' ? 'index.html' : decodedPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 - Página não encontrada');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end(`Erro no servidor: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, async () => {
  console.log(`⚽ Servidor com Server-Sent Events (SSE) rodando em http://localhost:${PORT}`);
  try {
    console.log('📡 Carregando dados iniciais do GE...');
    const inicial = await getDadosTabela(true);
    ultimoSnapshotJson = JSON.stringify(inicial.classificacao.map(t => `${t.ordem}:${t.sigla}:${t.pontos}:${t.jogos}:${t.vitorias}`));
    console.log('✅ Dados carregados com sucesso! Monitorando atualizações a cada 30 segundos...');
  } catch (err) {
    console.error('⚠️ Aviso ao buscar dados iniciais:', err.message);
  }
});
