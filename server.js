const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Configuração das Séries suportadas do Brasileirão
const SERIES_CONFIG = {
  a: {
    codigo: 'a',
    nome: 'Série A',
    url: 'https://ge.globo.com/futebol/brasileirao-serie-a/',
    cacheFile: path.join(DATA_DIR, 'tabela-serie-a.json')
  },
  b: {
    codigo: 'b',
    nome: 'Série B',
    url: 'https://ge.globo.com/futebol/brasileirao-serie-b/',
    cacheFile: path.join(DATA_DIR, 'tabela-serie-b.json')
  }
};

// Intervalo de verificação automática do GE (em milissegundos)
const POLLING_INTERVAL_MS = 30 * 1000; // 30 segundos

// Armazena conexões ativas de Server-Sent Events (SSE)
const sseClients = new Set();

// Último hash/snapshot conhecido dos dados para detecção de alterações por série
const ultimoSnapshotJson = {
  a: '',
  b: ''
};
const dadosEmMemoria = {
  a: null,
  b: null
};

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Extrai os dados diretamente da estrutura HTML do GE para uma série específica
async function fetchTabelaDoGE(serie = 'a') {
  const config = SERIES_CONFIG[serie] || SERIES_CONFIG.a;

  return new Promise((resolve, reject) => {
    const req = https.get(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Erro ao acessar GE (${config.nome}): status ${res.statusCode}`));
      }

      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          // Extrai o bloco JSON 'const classificacao = {...};' da estrutura da página
          const match = html.match(/const\s+classificacao\s*=\s*(\{[\s\S]*?\});/);
          if (!match || !match[1]) {
            return reject(new Error(`Estrutura da tabela não encontrada na página do GE (${config.nome})`));
          }

          const parsed = JSON.parse(match[1]);
          if (!parsed.classificacao || !Array.isArray(parsed.classificacao)) {
            return reject(new Error(`Formato inesperado dos dados de classificação (${config.nome})`));
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
            serie: config.codigo,
            nomeSerie: config.nome,
            origem: config.url,
            atualizadoEm: new Date().toISOString(),
            totalTimes: times.length,
            classificacao: times
          };

          // Salva no cache local
          fs.writeFileSync(config.cacheFile, JSON.stringify(resultado, null, 2), 'utf8');
          dadosEmMemoria[config.codigo] = resultado;
          resolve(resultado);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error(`Timeout ao conectar com o GE (${config.nome})`));
    });
  });
}

// Obtém os dados (da memória/cache ou direto do GE) para a série especificada
async function getDadosTabela(serie = 'a', forceRefresh = false) {
  const codigo = SERIES_CONFIG[serie] ? serie : 'a';
  const config = SERIES_CONFIG[codigo];

  if (!forceRefresh && dadosEmMemoria[codigo]) {
    return dadosEmMemoria[codigo];
  }

  // Fallback para arquivo antigo data/tabela.json se serie === 'a'
  const fallbackLegacy = (codigo === 'a' && fs.existsSync(path.join(DATA_DIR, 'tabela.json')))
    ? path.join(DATA_DIR, 'tabela.json')
    : null;
  const targetCacheFile = fs.existsSync(config.cacheFile) ? config.cacheFile : fallbackLegacy;

  if (!forceRefresh && targetCacheFile && fs.existsSync(targetCacheFile)) {
    try {
      const stats = fs.statSync(targetCacheFile);
      const cacheAgeMs = Date.now() - stats.mtimeMs;
      if (cacheAgeMs < 10 * 60 * 1000) {
        dadosEmMemoria[codigo] = JSON.parse(fs.readFileSync(targetCacheFile, 'utf8'));
        dadosEmMemoria[codigo].serie = codigo;
        dadosEmMemoria[codigo].nomeSerie = config.nome;
        return dadosEmMemoria[codigo];
      }
    } catch (e) {
      console.warn(`Erro ao ler cache da ${config.nome}, buscando online:`, e.message);
    }
  }

  try {
    const dados = await fetchTabelaDoGE(codigo);
    return dados;
  } catch (err) {
    if (dadosEmMemoria[codigo]) return dadosEmMemoria[codigo];
    if (targetCacheFile && fs.existsSync(targetCacheFile)) {
      dadosEmMemoria[codigo] = JSON.parse(fs.readFileSync(targetCacheFile, 'utf8'));
      dadosEmMemoria[codigo].serie = codigo;
      dadosEmMemoria[codigo].nomeSerie = config.nome;
      return dadosEmMemoria[codigo];
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
  console.log(`📢 Atualização SSE (${dados.nomeSerie || dados.serie}) transmitida para ${sseClients.size} cliente(s) ativo(s).`);
}

// Checagem periódica em segundo plano para capturar atualizações no GE
async function verificarAtualizacoesNoGE() {
  for (const codigo of ['a', 'b']) {
    try {
      const dados = await fetchTabelaDoGE(codigo);
      const snapshotAtual = JSON.stringify(dados.classificacao.map(t => `${t.ordem}:${t.sigla}:${t.pontos}:${t.jogos}:${t.vitorias}`));

      // Se houve mudança no ranking ou nos valores de P, J, V
      if (snapshotAtual !== ultimoSnapshotJson[codigo]) {
        console.log(`⚡ Mudança detectada na tabela ${dados.nomeSerie} do GE! Enviando evento aos clientes...`);
        ultimoSnapshotJson[codigo] = snapshotAtual;
        broadcastSSE(dados);
      }
    } catch (err) {
      console.warn(`⚠️ Falha temporária na verificação periódica do GE (${codigo.toUpperCase()}):`, err.message);
    }
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

    // Envia os dados atuais da Série solicitada (ou Série A por padrão) imediatamente
    const serie = (reqUrl.searchParams.get('serie') || 'a').toLowerCase();
    try {
      const dadosAtuais = await getDadosTabela(serie, false);
      res.write(`event: tabela\ndata: ${JSON.stringify(dadosAtuais)}\n\n`);
    } catch (e) {
      console.warn(`Erro ao enviar estado inicial SSE (${serie}):`, e.message);
    }

    req.on('close', () => {
      sseClients.delete(res);
      console.log(`🔌 Cliente SSE desconectado. Restantes: ${sseClients.size}`);
    });
    return;
  }

  // Endpoint REST da Tabela
  if (reqUrl.pathname === '/api/tabela') {
    const serie = (reqUrl.searchParams.get('serie') || 'a').toLowerCase();
    const forceRefresh = reqUrl.searchParams.get('refresh') === 'true';
    try {
      const dados = await getDadosTabela(serie, forceRefresh);
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
  for (const codigo of ['a', 'b']) {
    try {
      console.log(`📡 Carregando dados iniciais da ${SERIES_CONFIG[codigo].nome} do GE...`);
      const inicial = await getDadosTabela(codigo, true);
      ultimoSnapshotJson[codigo] = JSON.stringify(inicial.classificacao.map(t => `${t.ordem}:${t.sigla}:${t.pontos}:${t.jogos}:${t.vitorias}`));
      console.log(`✅ Dados da ${SERIES_CONFIG[codigo].nome} carregados com sucesso! (${inicial.totalTimes} times)`);
    } catch (err) {
      console.error(`⚠️ Aviso ao buscar dados iniciais da ${codigo.toUpperCase()}:`, err.message);
    }
  }
  console.log('🔄 Monitoramento automático ativo a cada 30 segundos...');
});
