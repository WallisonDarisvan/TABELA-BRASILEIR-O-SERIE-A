/**
 * JOGOS DA RODADA - LÓGICA MODULAR
 * Gerencia a navegação entre rodadas, distribuição em 2 colunas e consumo da API do GE
 */

// Estado da Tela de Jogos
const gamesState = {
  serie: 'a',
  rodada: null,
  rodadaAtual: null,
  totalRodadas: 38,
  jogos: [],
  carregando: false
};

// Elementos do DOM
const gamesElements = {
  btnOpenSeriesModal: document.getElementById('btnOpenSeriesModal'),
  currentSeriesLabel: document.getElementById('currentSeriesLabel'),
  btnVoltarTabela: document.getElementById('btnVoltarTabela'),

  // Navegador de Rodadas
  btnPrevRound: document.getElementById('btnPrevRound'),
  btnNextRound: document.getElementById('btnNextRound'),
  roundTitleText: document.getElementById('roundTitleText'),
  roundBadgeCurrent: document.getElementById('roundBadgeCurrent'),
  roundSubtitle: document.getElementById('roundSubtitle'),

  // Colunas de Jogos (5 em cada)
  gamesColLeft: document.getElementById('gamesColLeft'),
  gamesColRight: document.getElementById('gamesColRight'),
  gamesContainer: document.getElementById('gamesContainer'),

  // Modal de Série
  seriesModal: document.getElementById('seriesModal'),
  btnCloseSeriesModal: document.getElementById('btnCloseSeriesModal'),
  seriesOptions: document.querySelectorAll('.series-card-option')
};

// Inicialização segura
function inicializarJogos() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramSerie = urlParams.get('serie');
  if (paramSerie && (paramSerie.toLowerCase() === 'b' || paramSerie.toLowerCase() === 'a')) {
    gamesState.serie = paramSerie.toLowerCase();
  }

  const paramRodada = urlParams.get('rodada');
  if (paramRodada && !isNaN(parseInt(paramRodada, 10))) {
    gamesState.rodada = parseInt(paramRodada, 10);
  }

  setupGamesEventListeners();
  if (window.state && window.state.tela === 'jogos') {
    carregarJogos();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarJogos);
} else {
  inicializarJogos();
}

// Navegação de rodadas por delta (-1 ou +1)
let isNavigatingRound = false;
function mudarRodadaDelta(delta) {
  if (isNavigatingRound) return;
  isNavigatingRound = true;
  setTimeout(() => { isNavigatingRound = false; }, 250);

  const atual = gamesState.rodada || gamesState.rodadaAtual || 34;
  const nova = atual + delta;
  if (nova >= 1 && nova <= (gamesState.totalRodadas || 38)) {
    mudarRodada(nova, true);
  }
}
window.mudarRodadaDelta = mudarRodadaDelta;
window.voltarRodada = () => mudarRodadaDelta(-1);
window.avancarRodada = () => mudarRodadaDelta(1);

// Configura os ouvintes de eventos da página de jogos
function setupGamesEventListeners() {
  const btnPrev = document.getElementById('btnPrevRound');
  const btnNext = document.getElementById('btnNextRound');

  if (btnPrev) {
    btnPrev.onclick = (e) => {
      e.preventDefault();
      mudarRodadaDelta(-1);
    };
  }

  if (btnNext) {
    btnNext.onclick = (e) => {
      e.preventDefault();
      mudarRodadaDelta(1);
    };
  }

  document.addEventListener('keydown', (e) => {
    if (window.state && window.state.tela !== 'jogos') return;
    if (e.key === 'ArrowLeft') {
      mudarRodadaDelta(-1);
    } else if (e.key === 'ArrowRight') {
      mudarRodadaDelta(1);
    }
  });
}

// Altera a rodada e sincroniza com todos os aparelhos
function mudarRodada(novaRodada, sync = true) {
  gamesState.rodada = novaRodada;
  if (sync && typeof SYNC !== 'undefined') {
    SYNC.send({ rodada: novaRodada, serie: gamesState.serie, tela: 'jogos' });
  }
  carregarJogos();
}

// Atualiza a visualização do cabeçalho da Série
function atualizarHeaderSerie() {
  const nomeExibicao = gamesState.serie === 'b' ? 'Série B' : 'Série A';
  if (gamesElements.currentSeriesLabel) {
    gamesElements.currentSeriesLabel.textContent = nomeExibicao;
  }
  if (gamesElements.btnVoltarTabela) {
    gamesElements.btnVoltarTabela.href = `index.html?serie=${gamesState.serie}`;
  }
  document.title = `Jogos do Brasileirão ${nomeExibicao} | Confrontos da Rodada`;

  gamesElements.seriesOptions.forEach(btn => {
    if (btn.dataset.serie === gamesState.serie) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Troca de Série na tela de jogos
function trocarSerieJogos(novaSerie, sync = true) {
  gamesState.serie = novaSerie;
  gamesState.rodada = null; // reseta para pegar a rodada atual da nova série
  atualizarHeaderSerie();
  if (sync && typeof SYNC !== 'undefined') {
    SYNC.send({ serie: novaSerie, rodada: null, tela: 'jogos' });
  }
  carregarJogos();
}

// Carrega os dados dos jogos da rodada via endpoint do backend
async function carregarJogos() {
  if (window.state && window.state.serie) {
    gamesState.serie = window.state.serie;
  }

  // Atualiza referências do DOM se necessário
  gamesElements.btnPrevRound = document.getElementById('btnPrevRound');
  gamesElements.btnNextRound = document.getElementById('btnNextRound');
  gamesElements.roundTitleText = document.getElementById('roundTitleText');
  gamesElements.roundBadgeCurrent = document.getElementById('roundBadgeCurrent');
  gamesElements.roundSubtitle = document.getElementById('roundSubtitle');
  gamesElements.gamesColLeft = document.getElementById('gamesColLeft');
  gamesElements.gamesColRight = document.getElementById('gamesColRight');

  gamesState.carregando = true;
  atualizarBotoesNavegacao();
  exibirLoading();

  const queryRodada = gamesState.rodada ? `&rodada=${gamesState.rodada}` : '';
  const url = `/api/jogos?serie=${gamesState.serie}${queryRodada}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);

    const data = await res.json();
    gamesState.rodada = data.rodada;
    gamesState.rodadaAtual = data.rodadaAtual;
    gamesState.totalRodadas = data.totalRodadas || 38;
    gamesState.jogos = data.jogos || [];

    renderizarRodadaInfo();
    renderizarJogosEmDuasColunas();
  } catch (err) {
    console.error('Erro ao buscar jogos da rodada:', err);
    exibirErro();
  } finally {
    gamesState.carregando = false;
    atualizarBotoesNavegacao();
  }
}

// Expõe globalmente para alternância de abas e sincronização
window.carregarJogos = carregarJogos;
window.mudarRodada = mudarRodada;
window.trocarSerieJogos = trocarSerieJogos;

// Atualiza o estado dos botões de avançar/voltar rodada
function atualizarBotoesNavegacao() {
  const rodada = gamesState.rodada || gamesState.rodadaAtual || 34;
  const total = gamesState.totalRodadas || 38;
  const btnPrev = document.getElementById('btnPrevRound');
  const btnNext = document.getElementById('btnNextRound');

  if (btnPrev) {
    btnPrev.disabled = (rodada <= 1);
  }
  if (btnNext) {
    btnNext.disabled = (rodada >= total);
  }
}

// Atualiza as informações de texto da rodada
function renderizarRodadaInfo() {
  if (gamesElements.roundTitleText) {
    gamesElements.roundTitleText.textContent = `${gamesState.rodada}ª RODADA`;
  }

  if (gamesElements.roundBadgeCurrent) {
    if (gamesState.rodada === gamesState.rodadaAtual) {
      gamesElements.roundBadgeCurrent.style.display = 'inline-block';
      gamesElements.roundBadgeCurrent.textContent = 'RODADA ATUAL';
    } else {
      gamesElements.roundBadgeCurrent.style.display = 'none';
    }
  }

  if (gamesElements.roundSubtitle) {
    const nomeSerie = gamesState.serie === 'b' ? 'Série B' : 'Série A';
    gamesElements.roundSubtitle.textContent = `Campeonato Brasileiro ${nomeSerie} · Rodada ${gamesState.rodada} de ${gamesState.totalRodadas}`;
  }
}

// Formata a data do confronto
function formatarDataHora(isoString, horaRealizacao) {
  if (!isoString && !horaRealizacao) return '';

  try {
    const date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const diaSemana = diasSemana[date.getDay()];
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      return `${diaSemana}, ${dia}/${mes}`;
    }
  } catch (e) {}

  return '';
}

// Cria o HTML de um Card de Partida (Com tag de status na mesma linha do local para economizar espaço)
function criarCardJogoHtml(jogo) {
  const dataFormatada = formatarDataHora(jogo.dataRealizacao, jogo.horaRealizacao);
  const estadio = jogo.estadio || 'Local a definir';

  const placarMandante = (jogo.mandante.placar !== null && jogo.mandante.placar !== undefined) ? jogo.mandante.placar : '';
  const placarVisitante = (jogo.visitante.placar !== null && jogo.visitante.placar !== undefined) ? jogo.visitante.placar : '';

  // Determina etiqueta de status (ao vivo, encerrado ou horário)
  let statusHtml = '';
  if (jogo.status === 'AO_VIVO' || jogo.status === 'EM_ANDAMENTO') {
    statusHtml = `<span class="game-status-tag status-live">AO VIVO</span>`;
  } else if (jogo.jaComecou || jogo.status === 'ENCERRADA') {
    statusHtml = `<span class="game-status-tag status-finished">ENCERRADO</span>`;
  } else if (jogo.horaRealizacao) {
    statusHtml = `<span class="game-status-tag status-scheduled">${jogo.horaRealizacao}</span>`;
  } else {
    statusHtml = `<span class="game-status-tag status-scheduled">A DEFINIR</span>`;
  }

  return `
    <div class="game-match-card">
      <div class="game-meta-header">
        <div class="game-stadium" title="${estadio}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>${estadio}</span>
        </div>
        <div class="game-meta-right">
          ${dataFormatada ? `<span class="game-datetime">${dataFormatada}</span>` : ''}
          ${statusHtml}
        </div>
      </div>

      <div class="game-teams-clash">
        <!-- Mandante -->
        <div class="team-side team-home">
          <span class="team-club-name" title="${jogo.mandante.nome}">${jogo.mandante.nome}</span>
          <img class="team-club-escudo" src="${jogo.mandante.escudo}" alt="${jogo.mandante.nome}" loading="lazy" onerror="this.style.opacity='0.3'">
        </div>

        <!-- Placar -->
        <div class="game-score-box">
          <span class="score-digit">${placarMandante !== '' ? placarMandante : '-'}</span>
          <span class="score-divider">x</span>
          <span class="score-digit">${placarVisitante !== '' ? placarVisitante : '-'}</span>
        </div>

        <!-- Visitante -->
        <div class="team-side team-away">
          <img class="team-club-escudo" src="${jogo.visitante.escudo}" alt="${jogo.visitante.nome}" loading="lazy" onerror="this.style.opacity='0.3'">
          <span class="team-club-name" title="${jogo.visitante.nome}">${jogo.visitante.nome}</span>
        </div>
      </div>
    </div>
  `;
}

// Renderiza exatamente os 10 jogos divididos em 2 colunas de 5
function renderizarJogosEmDuasColunas() {
  if (!gamesState.jogos || gamesState.jogos.length === 0) {
    gamesElements.gamesColLeft.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #64748b;">
        Nenhum jogo encontrado para esta rodada.
      </div>
    `;
    gamesElements.gamesColRight.innerHTML = '';
    return;
  }

  // Divide exatamente 5 jogos em cada coluna
  const colunaEsquerdaJogos = gamesState.jogos.slice(0, 5);
  const colunaDireitaJogos = gamesState.jogos.slice(5, 10);

  gamesElements.gamesColLeft.innerHTML = colunaEsquerdaJogos.map(criarCardJogoHtml).join('');
  gamesElements.gamesColRight.innerHTML = colunaDireitaJogos.map(criarCardJogoHtml).join('');
}

function exibirLoading() {
  const loadingHtml = `
    <div style="padding: 30px; text-align: center; color: #00a854; font-weight: 600;">
      <div class="spinner" style="margin: 0 auto 12px;"></div>
      <p>Carregando confrontos da ${gamesState.rodada ? gamesState.rodada + 'ª ' : ''}rodada...</p>
    </div>
  `;
  gamesElements.gamesColLeft.innerHTML = loadingHtml;
  gamesElements.gamesColRight.innerHTML = '';
}

function exibirErro() {
  gamesElements.gamesColLeft.innerHTML = `
    <div style="padding: 24px; text-align: center; color: #ef4444; background: #fff; border-radius: 8px;">
      <p>Não foi possível obter os jogos desta rodada no momento.</p>
      <button onclick="carregarJogos()" style="margin-top: 10px; padding: 6px 14px; background: #00a854; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Tentar novamente</button>
    </div>
  `;
  gamesElements.gamesColRight.innerHTML = '';
}

