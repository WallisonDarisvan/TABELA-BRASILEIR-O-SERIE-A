/**
 * TABELA BRASILEIRÃO SÉRIE A - LÓGICA INTERATIVA
 * Consome os dados oficiais da estrutura do ge.globo com Server-Sent Events (SSE)
 */

// Estado da Aplicação
const state = {
  times: [],
  ordenacao: {
    coluna: 'pontos',
    direcao: 'desc' // 'desc' ou 'asc'
  },
  timeSelecionadoParaComparar: null,
  ultimaAtualizacao: null,
  sseConectado: false
};

// Elementos do DOM
const elements = {
  tabelaCorpo: document.getElementById('tabelaCorpo'),

  // Modal de comparação
  compareModal: document.getElementById('compareModal'),
  compareModalBody: document.getElementById('compareModalBody'),
  btnCloseCompare: document.getElementById('btnCloseCompare')
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupSSE();
  // Carrega imediatamente enquanto o SSE conecta
  carregarDados();
});

// Configura os ouvintes de eventos da UI
function setupEventListeners() {
  // Ordenação nos cabeçalhos da tabela
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const coluna = th.dataset.sort;
      if (state.ordenacao.coluna === coluna) {
        state.ordenacao.direcao = state.ordenacao.direcao === 'desc' ? 'asc' : 'desc';
      } else {
        state.ordenacao.coluna = coluna;
        // Posição e Time por padrão 'asc', Estatísticas (P, J, V) por padrão 'desc'
        state.ordenacao.direcao = (coluna === 'ordem' || coluna === 'time') ? 'asc' : 'desc';
      }
      atualizarIndicadoresOrdenacao();
      renderizarTabela();
    });
  });

  // Fechar modal de comparação
  elements.btnCloseCompare.addEventListener('click', fecharModalComparacao);
  elements.compareModal.addEventListener('click', (e) => {
    if (e.target === elements.compareModal) fecharModalComparacao();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.compareModal.style.display !== 'none') {
      fecharModalComparacao();
    }
  });
}

// Configuração de Server-Sent Events (SSE) para atualização automática em tempo real
function setupSSE() {
  if (!window.EventSource) {
    console.warn('Navegador não suporta EventSource. Atualizações serão manuais ou por polling.');
    return;
  }

  const eventSource = new EventSource('/api/events');

  // Recebe eventos da tabela transmitidos pelo servidor
  eventSource.addEventListener('tabela', (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('⚡ Evento SSE recebido:', data);
      aplicarDados(data, true);
    } catch (err) {
      console.error('Erro ao processar dados recebidos via SSE:', err);
    }
  });

  eventSource.onopen = () => {
    console.log('🟢 Conexão Server-Sent Events estabelecida com sucesso!');
    state.sseConectado = true;
  };

  eventSource.onerror = (err) => {
    console.warn('⚠️ Conexão SSE instável, reconectando automaticamente...');
    state.sseConectado = false;
  };
}

// Aplica os novos dados recebidos e renderiza com efeito visual
function aplicarDados(data, viaSSE = false) {
  if (!data.classificacao || !Array.isArray(data.classificacao)) return;

  state.times = data.classificacao;
  state.ultimaAtualizacao = data.atualizadoEm ? new Date(data.atualizadoEm) : new Date();

  atualizarIndicadoresOrdenacao();
  renderizarTabela();

  // Efeito visual sutil quando chega uma atualização automática
  if (viaSSE && elements.tabelaCorpo) {
    elements.tabelaCorpo.classList.remove('flash-update');
    // Força reflow para reiniciar animação
    void elements.tabelaCorpo.offsetWidth;
    elements.tabelaCorpo.classList.add('flash-update');
  }
}

// Carrega os dados da API com fallback resiliente
async function carregarDados() {
  try {
    let response;
    try {
      response = await fetch('/api/tabela');
    } catch (netErr) {
      response = await fetch('./data/tabela.json');
    }

    if (!response.ok) {
      throw new Error(`Resposta do servidor: ${response.status}`);
    }

    const data = await response.json();
    aplicarDados(data, false);
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    try {
      const localResp = await fetch('./data/tabela.json');
      const localData = await localResp.json();
      aplicarDados(localData, false);
    } catch (e) {
      elements.tabelaCorpo.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">
            Não foi possível carregar a tabela. Verifique se o servidor está rodando (node server.js).
          </td>
        </tr>
      `;
    }
  }
}

// Atualiza as setinhas de ordenação nos cabeçalhos
function atualizarIndicadoresOrdenacao() {
  const { coluna, direcao } = state.ordenacao;
  const seta = direcao === 'desc' ? '▼' : '▲';

  // Limpa todos os indicadores
  document.querySelectorAll('.sort-indicator').forEach(el => el.textContent = '');
  document.querySelectorAll('th.sortable').forEach(th => th.classList.remove('active'));

  // Ativa a coluna atual
  const activeTh = document.querySelector(`th[data-sort="${coluna}"]`);
  const activeIcon = document.getElementById(`sort-icon-${coluna}`);

  if (activeTh) activeTh.classList.add('active');
  if (activeIcon) activeIcon.textContent = seta;
}

// Retorna a cor da faixa oficial de acordo com a posição original no campeonato
function getCorFaixa(ordem) {
  if (ordem >= 1 && ordem <= 4) return 'var(--zona-libertadores)';
  if (ordem >= 5 && ordem <= 6) return 'var(--zona-pre-libertadores)';
  if (ordem >= 7 && ordem <= 12) return 'var(--zona-sul-americana)';
  if (ordem >= 13 && ordem <= 16) return 'var(--zona-permanencia)';
  if (ordem >= 17 && ordem <= 20) return 'var(--zona-rebaixamento)';
  return 'transparent';
}

// Renderiza a tabela de acordo com a ordenação
function renderizarTabela() {
  if (!state.times || state.times.length === 0) return;

  const lista = [...state.times];

  // Ordenação
  const { coluna, direcao } = state.ordenacao;
  lista.sort((a, b) => {
    let valA = a[coluna];
    let valB = b[coluna];

    if (typeof valA === 'string') {
      return direcao === 'asc' 
        ? valA.localeCompare(valB, 'pt-BR') 
        : valB.localeCompare(valA, 'pt-BR');
    }

    return direcao === 'asc' ? valA - valB : valB - valA;
  });

  // Construção das linhas HTML
  const linhasHtml = lista.map(item => {
    const corFaixa = getCorFaixa(item.ordem);
    
    // Variação de posição recente
    let variacaoHtml = '<span class="variacao-tag var-equal" title="Manteve a posição">•</span>';
    if (item.variacao > 0) {
      variacaoHtml = `<span class="variacao-tag var-up" title="Subiu ${item.variacao} posições">▲${item.variacao}</span>`;
    } else if (item.variacao < 0) {
      variacaoHtml = `<span class="variacao-tag var-down" title="Caiu ${Math.abs(item.variacao)} posições">▼${Math.abs(item.variacao)}</span>`;
    }

    return `
      <tr data-team-id="${item.sigla}" onclick="abrirComparador('${item.sigla}')" title="Clique para detalhes e comparação do ${item.time}">
        <td class="td-pos">
          <span class="faixa-indicador" style="background-color: ${corFaixa};"></span>
          <div class="pos-wrapper">
            <span>${item.ordem}º</span>
            ${variacaoHtml}
          </div>
        </td>
        <td class="td-time">
          <div class="club-cell">
            <img class="club-escudo" src="${item.escudo}" alt="Escudo ${item.time}" loading="lazy" onerror="this.style.opacity='0.3'">
            <span class="club-name">${item.time}</span>
          </div>
        </td>
        <td class="td-pontos" title="${item.pontos} Pontos">${item.pontos}</td>
        <td class="td-jogos" title="${item.jogos} Jogos">${item.jogos}</td>
        <td class="td-vitorias" title="${item.vitorias} Vitórias">${item.vitorias}</td>
      </tr>
    `;
  }).join('');

  elements.tabelaCorpo.innerHTML = linhasHtml;
}

// Abre modal de comparação comparando o time clicado com o líder (ou o segundo)
window.abrirComparador = function(sigla) {
  const time = state.times.find(t => t.sigla === sigla);
  if (!time) return;

  const líder = [...state.times].sort((a, b) => a.ordem - b.ordem)[0];
  const adversario = time.ordem === 1 
    ? state.times.find(t => t.ordem === 2) 
    : líder;

  if (!adversario) return;

  elements.compareModalBody.innerHTML = `
    <div class="compare-grid">
      <div class="compare-card ${time.pontos >= adversario.pontos ? 'winner' : ''}">
        <img class="compare-escudo" src="${time.escudo}" alt="${time.time}">
        <div class="compare-name">${time.time} (${time.ordem}º)</div>
        <div class="compare-stat">
          <span>Pontos (P)</span>
          <strong>${time.pontos}</strong>
        </div>
        <div class="compare-stat">
          <span>Jogos (J)</span>
          <strong>${time.jogos}</strong>
        </div>
        <div class="compare-stat">
          <span>Vitórias (V)</span>
          <strong>${time.vitorias}</strong>
        </div>
      </div>

      <div class="compare-card ${adversario.pontos > time.pontos ? 'winner' : ''}">
        <img class="compare-escudo" src="${adversario.escudo}" alt="${adversario.time}">
        <div class="compare-name">${adversario.time} (${adversario.ordem}º)</div>
        <div class="compare-stat">
          <span>Pontos (P)</span>
          <strong>${adversario.pontos}</strong>
        </div>
        <div class="compare-stat">
          <span>Jogos (J)</span>
          <strong>${adversario.jogos}</strong>
        </div>
        <div class="compare-stat">
          <span>Vitórias (V)</span>
          <strong>${adversario.vitorias}</strong>
        </div>
      </div>
    </div>
  `;

  elements.compareModal.style.display = 'flex';
};

function fecharModalComparacao() {
  elements.compareModal.style.display = 'none';
}
