/**
 * TABELA BRASILEIRÃO SÉRIE A - LÓGICA INTERATIVA
 * Consome os dados oficiais da estrutura do ge.globo com Server-Sent Events (SSE)
 */

// Estado da Aplicação
const state = {
  tela: 'tabela', // 'tabela' ou 'jogos'
  serie: 'a', // 'a' ou 'b'
  times: [],
  ordenacao: {
    coluna: 'pontos',
    direcao: 'desc' // 'desc' ou 'asc'
  },
  timeSelecionadoParaComparar: null,
  ultimaAtualizacao: null,
  sseConectado: false
};
window.state = state;

// Elementos do DOM
const elements = {
  tabelaCorpo: document.getElementById('tabelaCorpo'),
  btnOpenSeriesModal: document.getElementById('btnOpenSeriesModal'),
  currentSeriesLabel: document.getElementById('currentSeriesLabel'),
  btnToggleView: document.getElementById('btnToggleView'),
  navViewText: document.getElementById('navViewText'),
  viewTabela: document.getElementById('viewTabela'),
  viewJogos: document.getElementById('viewJogos'),

  // Modal de seleção de série
  seriesModal: document.getElementById('seriesModal'),
  btnCloseSeriesModal: document.getElementById('btnCloseSeriesModal'),
  seriesOptions: document.querySelectorAll('.series-card-option'),

  // Modal de comparação
  compareModal: document.getElementById('compareModal'),
  compareModalBody: document.getElementById('compareModalBody'),
  btnCloseCompare: document.getElementById('btnCloseCompare')
};

// Inicialização segura
function inicializarApp() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramSerie = urlParams.get('serie');
  if (paramSerie && (paramSerie.toLowerCase() === 'b' || paramSerie.toLowerCase() === 'a')) {
    state.serie = paramSerie.toLowerCase();
  }

  const nomeExibicao = state.serie === 'b' ? 'Série B' : 'Série A';
  const labelEl = document.getElementById('currentSeriesLabel');
  if (labelEl) labelEl.textContent = nomeExibicao;
  document.title = `Tabela Brasileirão ${nomeExibicao} | Classificação Interativa`;

  document.querySelectorAll('.series-card-option').forEach(btn => {
    if (btn.dataset.serie === state.serie) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Se veio pela URL para ver jogos
  const paramView = urlParams.get('view');
  if (paramView === 'jogos') {
    alternarTela('jogos', false);
  }

  setupEventListeners();
  setupSSE();
  carregarDados();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarApp);
} else {
  inicializarApp();
}

// Funções expostas globalmente para máxima robustez
let isTogglingView = false;
window.alternarTelaView = function() {
  if (isTogglingView) return;
  isTogglingView = true;
  setTimeout(() => { isTogglingView = false; }, 300);

  const proximaTela = (state.tela === 'jogos') ? 'tabela' : 'jogos';
  alternarTela(proximaTela, true);
};

window.abrirModalSeries = function() {
  const modal = document.getElementById('seriesModal');
  if (modal) modal.style.display = 'flex';
};

window.fecharModalSeries = function() {
  const modal = document.getElementById('seriesModal');
  if (modal) modal.style.display = 'none';
};

window.selecionarSerie = function(novaSerie) {
  window.fecharModalSeries();
  if (novaSerie && novaSerie !== state.serie) {
    trocarSerie(novaSerie, true);
  }
};

window.fecharModalComparacao = function() {
  const modal = document.getElementById('compareModal');
  if (modal) modal.style.display = 'none';
  state.timeSelecionadoParaComparar = null;
};

// Alterna instantaneamente entre a visão de Tabela e a visão de Jogos
function alternarTela(tela, sync = true) {
  state.tela = tela;
  const viewTabela = document.getElementById('viewTabela');
  const viewJogos = document.getElementById('viewJogos');
  const navViewText = document.getElementById('navViewText');
  const headerRoundNav = document.getElementById('headerRoundNav');

  if (tela === 'jogos') {
    if (viewTabela) viewTabela.style.setProperty('display', 'none', 'important');
    if (viewJogos) viewJogos.style.setProperty('display', 'flex', 'important');
    if (headerRoundNav) headerRoundNav.style.setProperty('display', 'flex', 'important');
    if (navViewText) navViewText.textContent = 'TABELA';
    if (typeof window.carregarJogos === 'function') {
      window.carregarJogos();
    }
  } else {
    if (viewJogos) viewJogos.style.setProperty('display', 'none', 'important');
    if (headerRoundNav) headerRoundNav.style.setProperty('display', 'none', 'important');
    if (viewTabela) viewTabela.style.setProperty('display', 'block', 'important');
    if (navViewText) navViewText.textContent = 'JOGOS';
  }

  if (sync && typeof SYNC !== 'undefined' && SYNC.send) {
    SYNC.send({ tela, serie: state.serie });
  }
}
window.alternarTela = alternarTela;

// Configura os ouvintes de eventos da UI
function setupEventListeners() {
  // Delegação global de cliques para blindagem total em qualquer navegador/dispositivo
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btnToggleView')) {
      e.preventDefault();
      window.alternarTelaView();
    } else if (e.target.closest('#btnOpenSeriesModal')) {
      e.preventDefault();
      window.abrirModalSeries();
    } else if (e.target.closest('#btnCloseSeriesModal')) {
      e.preventDefault();
      window.fecharModalSeries();
    } else if (e.target.closest('#btnCloseCompare')) {
      e.preventDefault();
      window.fecharModalComparacao();
    } else if (e.target.closest('.series-card-option')) {
      const btn = e.target.closest('.series-card-option');
      const novaSerie = btn.dataset.serie;
      window.selecionarSerie(novaSerie);
    }
  });

  // Ordenação nos cabeçalhos da tabela
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const coluna = th.dataset.sort;
      if (state.ordenacao.coluna === coluna) {
        state.ordenacao.direcao = state.ordenacao.direcao === 'desc' ? 'asc' : 'desc';
      } else {
        state.ordenacao.coluna = coluna;
        state.ordenacao.direcao = (coluna === 'ordem' || coluna === 'time') ? 'asc' : 'desc';
      }
      atualizarIndicadoresOrdenacao();
      renderizarTabela();

      if (typeof SYNC !== 'undefined' && SYNC.send) {
        SYNC.send({ ordenacao: state.ordenacao, tela: 'tabela' });
      }
    });
  });

  if (elements.compareModal) {
    elements.compareModal.addEventListener('click', (e) => {
      if (e.target === elements.compareModal) window.fecharModalComparacao();
    });
  }

  if (elements.seriesModal) {
    elements.seriesModal.addEventListener('click', (e) => {
      if (e.target === elements.seriesModal) window.fecharModalSeries();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elements.seriesModal && elements.seriesModal.style.display !== 'none') {
        fecharModalSeries();
      } else if (elements.compareModal && elements.compareModal.style.display !== 'none') {
        fecharModalComparacao();
      }
    }
  });
}

function abrirModalSeries() {
  if (elements.seriesModal) {
    elements.seriesModal.style.display = 'flex';
  }
}

function fecharModalSeries() {
  if (elements.seriesModal) {
    elements.seriesModal.style.display = 'none';
  }
}

// Troca a série exibida e busca os dados correspondentes
async function trocarSerie(novaSerie, sync = true) {
  state.serie = novaSerie;
  const nomeExibicao = novaSerie === 'b' ? 'Série B' : 'Série A';

  // Atualiza rótulo no título
  if (elements.currentSeriesLabel) {
    elements.currentSeriesLabel.textContent = nomeExibicao;
  }

  // Atualiza título da página
  document.title = `Tabela Brasileirão ${nomeExibicao} | Classificação Interativa`;

  // Sincroniza estado de série com o módulo de jogos
  if (typeof window.trocarSerieJogos === 'function') {
    window.trocarSerieJogos(novaSerie, false);
  }

  // Sincroniza com as outras telas abertas se a ação partiu deste dispositivo
  if (sync && typeof SYNC !== 'undefined') {
    SYNC.send({ serie: novaSerie, tela: state.tela });
  }

  // Atualiza botões ativos no modal
  elements.seriesOptions.forEach(btn => {
    if (btn.dataset.serie === novaSerie) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (state.tela === 'jogos') {
    if (typeof window.carregarJogos === 'function') {
      window.carregarJogos();
    }
  } else {
    // Exibe estado de carregamento na tabela
    if (elements.tabelaCorpo) {
      elements.tabelaCorpo.innerHTML = `
        <tr class="loading-row">
          <td colspan="5">
            <div class="loading-container">
              <div class="spinner"></div>
              <p>Carregando tabela oficial da ${nomeExibicao}...</p>
            </div>
          </td>
        </tr>
      `;
    }
    await carregarDados();
  }
}

// Ouvinte de sincronização global recebida de outros dispositivos (ex: celular comandando a TV)
window.onSyncStateReceived = (data) => {
  // Sincroniza visualização da tela (Tabela ↔ Jogos)
  if (data.tela && data.tela !== state.tela) {
    alternarTela(data.tela, false);
  }

  // Sincroniza Série se mudou
  if (data.serie && data.serie !== state.serie) {
    trocarSerie(data.serie, false);
    if (typeof window.trocarSerieJogos === 'function') {
      window.trocarSerieJogos(data.serie, false);
    }
  }

  // Sincroniza ordenação se mudou
  if (data.ordenacao && (data.ordenacao.coluna !== state.ordenacao.coluna || data.ordenacao.direcao !== state.ordenacao.direcao)) {
    state.ordenacao = data.ordenacao;
    atualizarIndicadoresOrdenacao();
    renderizarTabela();
  }

  // Sincroniza rodada se mudou
  if (data.rodada && typeof window.mudarRodada === 'function') {
    window.mudarRodada(data.rodada, false);
  }
};

// Configuração de Server-Sent Events (SSE) para atualização automática em tempo real
function setupSSE() {
  if (!window.EventSource) {
    console.warn('Navegador não suporta EventSource. Atualizações serão manuais ou por polling.');
    return;
  }

  const eventSource = new EventSource('/api/events');

  // Recebe eventos de autenticação por PIN
  eventSource.addEventListener('auth_state', (event) => {
    try {
      const authData = JSON.parse(event.data);
      if (typeof SYNC !== 'undefined') {
        SYNC.handleAuthEvent(authData);
      }
    } catch (err) {
      console.error('Erro ao processar auth_state via SSE:', err);
    }
  });

  // Recebe eventos de sincronização entre telas (espelhamento em tempo real)
  eventSource.addEventListener('sync_state', (event) => {
    try {
      const syncData = JSON.parse(event.data);
      if (typeof SYNC !== 'undefined') {
        SYNC.handleSyncEvent(syncData);
      }
    } catch (err) {
      console.error('Erro ao processar sync_state via SSE:', err);
    }
  });

  // Recebe eventos da tabela transmitidos pelo servidor
  eventSource.addEventListener('tabela', (event) => {
    try {
      const data = JSON.parse(event.data);
      // Aplica apenas se o evento for da série atualmente visualizada
      if (!data.serie || data.serie === state.serie) {
        console.log(`⚡ Evento SSE recebido (${data.nomeSerie || data.serie}):`, data);
        aplicarDados(data, true);
      }
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

// Carrega os dados da API com fallback resiliente para a série atual
async function carregarDados() {
  const endpoint = `/api/tabela?serie=${state.serie}`;
  const localFallback = state.serie === 'b' ? './data/tabela-serie-b.json' : './data/tabela.json';

  try {
    let response;
    try {
      response = await fetch(endpoint);
    } catch (netErr) {
      response = await fetch(localFallback);
    }

    if (!response.ok) {
      throw new Error(`Resposta do servidor: ${response.status}`);
    }

    const data = await response.json();
    aplicarDados(data, false);
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    try {
      const localResp = await fetch(localFallback);
      const localData = await localResp.json();
      aplicarDados(localData, false);
    } catch (e) {
      const serieNome = state.serie === 'b' ? 'Série B' : 'Série A';
      elements.tabelaCorpo.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">
            Não foi possível carregar a tabela da ${serieNome}. Verifique se o servidor está rodando.
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
  if (state.serie === 'b') {
    if (ordem >= 1 && ordem <= 4) return 'var(--zona-libertadores)'; // G-4: Acesso à Série A
    if (ordem >= 17 && ordem <= 20) return 'var(--zona-rebaixamento)'; // Z-4: Rebaixamento à Série C
    return 'transparent';
  }

  // Série A
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
