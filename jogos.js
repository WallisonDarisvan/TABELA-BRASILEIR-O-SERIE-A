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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  // Lê parâmetros da URL
  const urlParams = new URLSearchParams(window.location.search);
  const paramSerie = urlParams.get('serie');
  if (paramSerie && (paramSerie.toLowerCase() === 'b' || paramSerie.toLowerCase() === 'a')) {
    gamesState.serie = paramSerie.toLowerCase();
  }

  const paramRodada = urlParams.get('rodada');
  if (paramRodada && !isNaN(parseInt(paramRodada, 10))) {
    gamesState.rodada = parseInt(paramRodada, 10);
  }

  atualizarHeaderSerie();
  setupGamesEventListeners();
  setupGamesSSE();
  carregarJogos();
});

// Configura os ouvintes de eventos da página de jogos
function setupGamesEventListeners() {
  // Botão Voltar para Tabela (sincroniza tela com os outros aparelhos)
  if (gamesElements.btnVoltarTabela) {
    gamesElements.btnVoltarTabela.addEventListener('click', (e) => {
      e.preventDefault();
      const destino = gamesElements.btnVoltarTabela.href;
      if (typeof SYNC !== 'undefined') {
        SYNC.send({ tela: 'tabela', serie: gamesState.serie });
      }
      setTimeout(() => {
        window.location.href = destino;
      }, 40);
    });
  }

  // Navegação de Rodada
  if (gamesElements.btnPrevRound) {
    gamesElements.btnPrevRound.addEventListener('click', () => {
      if (gamesState.rodada > 1 && !gamesState.carregando) {
        mudarRodada(gamesState.rodada - 1, true);
      }
    });
  }

  if (gamesElements.btnNextRound) {
    gamesElements.btnNextRound.addEventListener('click', () => {
      if (gamesState.rodada < gamesState.totalRodadas && !gamesState.carregando) {
        mudarRodada(gamesState.rodada + 1, true);
      }
    });
  }

  // Modal de Série
  if (gamesElements.btnOpenSeriesModal) {
    gamesElements.btnOpenSeriesModal.addEventListener('click', () => {
      if (gamesElements.seriesModal) gamesElements.seriesModal.style.display = 'flex';
    });
  }

  if (gamesElements.btnCloseSeriesModal) {
    gamesElements.btnCloseSeriesModal.addEventListener('click', fecharModalSeries);
  }

  if (gamesElements.seriesModal) {
    gamesElements.seriesModal.addEventListener('click', (e) => {
      if (e.target === gamesElements.seriesModal) fecharModalSeries();
    });
  }

  gamesElements.seriesOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const novaSerie = btn.dataset.serie;
      fecharModalSeries();
      if (novaSerie && novaSerie !== gamesState.serie) {
        trocarSerieJogos(novaSerie, true);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gamesElements.seriesModal && gamesElements.seriesModal.style.display !== 'none') {
      fecharModalSeries();
    } else if (e.key === 'ArrowLeft') {
      if (gamesState.rodada > 1 && !gamesState.carregando) {
        mudarRodada(gamesState.rodada - 1, true);
      }
    } else if (e.key === 'ArrowRight') {
      if (gamesState.rodada < gamesState.totalRodadas && !gamesState.carregando) {
        mudarRodada(gamesState.rodada + 1, true);
      }
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

function fecharModalSeries() {
  if (gamesElements.seriesModal) {
    gamesElements.seriesModal.style.display = 'none';
  }
}

// Configura SSE para escutar sincronização de outras telas (ex: celular comandando a TV)
function setupGamesSSE() {
  if (!window.EventSource) return;

  const eventSource = new EventSource('/api/events');

  // Recebe eventos de autenticação por PIN
  eventSource.addEventListener('auth_state', (event) => {
    try {
      const authData = JSON.parse(event.data);
      if (typeof SYNC !== 'undefined') {
        SYNC.handleAuthEvent(authData);
      }
    } catch (e) {
      console.error('Erro ao processar auth_state em jogos:', e);
    }
  });

  eventSource.addEventListener('sync_state', (event) => {
    try {
      const syncData = JSON.parse(event.data);
      if (typeof SYNC !== 'undefined') {
        SYNC.handleSyncEvent(syncData);
      }
    } catch (e) {
      console.error('Erro ao processar sync_state em jogos:', e);
    }
  });
}

// Ouvinte de sincronização global recebida de outro aparelho
window.onSyncStateReceived = (data) => {
  if (data.serie && data.serie !== gamesState.serie) {
    trocarSerieJogos(data.serie, false);
  } else if (data.rodada && data.rodada !== gamesState.rodada) {
    mudarRodada(data.rodada, false);
  }
};

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

// Atualiza o estado dos botões de avançar/voltar rodada
function atualizarBotoesNavegacao() {
  if (gamesElements.btnPrevRound) {
    gamesElements.btnPrevRound.disabled = gamesState.carregando || (gamesState.rodada <= 1);
  }
  if (gamesElements.btnNextRound) {
    gamesElements.btnNextRound.disabled = gamesState.carregando || (gamesState.rodada >= gamesState.totalRodadas);
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

// Formata a data e hora do confronto
function formatarDataHora(isoString, horaRealizacao) {
  if (!isoString && !horaRealizacao) return 'Data a definir';

  try {
    const date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const diaSemana = diasSemana[date.getDay()];
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const hora = horaRealizacao || `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      return `${diaSemana}, ${dia}/${mes} · ${hora}`;
    }
  } catch (e) {}

  return horaRealizacao ? `Horário: ${horaRealizacao}` : 'Data a definir';
}

// Cria o HTML de um Card de Partida
function criarCardJogoHtml(jogo) {
  const dataHoraFormatada = formatarDataHora(jogo.dataRealizacao, jogo.horaRealizacao);
  const estadio = jogo.estadio || 'Local a confirmar';

  const placarMandante = (jogo.mandante.placar !== null && jogo.mandante.placar !== undefined) ? jogo.mandante.placar : '';
  const placarVisitante = (jogo.visitante.placar !== null && jogo.visitante.placar !== undefined) ? jogo.visitante.placar : '';

  // Determina etiqueta de status
  let statusHtml = '';
  if (jogo.status === 'AO_VIVO' || jogo.status === 'EM_ANDAMENTO') {
    statusHtml = `<span class="game-status-tag status-live">AO VIVO</span>`;
  } else if (jogo.jaComecou || jogo.status === 'ENCERRADA') {
    statusHtml = `<span class="game-status-tag status-finished">ENCERRADO</span>`;
  } else {
    statusHtml = `<span class="game-status-tag status-scheduled">${jogo.horaRealizacao || 'A CONFIRMAR'}</span>`;
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
        <div class="game-datetime">${dataHoraFormatada}</div>
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

      <div class="game-card-footer">
        ${statusHtml}
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

