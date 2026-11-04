/**
 * SINCRONIZAÇÃO GLOBAL EM TEMPO REAL (SYNC) & CONTROLE DE ACESSO POR PIN
 * Permite que qualquer dispositivo (TV, celular, tablet, computador) controle
 * e espelhe todas as ações instantaneamente em todas as telas abertas.
 * Exige PIN para liberar as telas e bloqueia automaticamente quando não houver telas ativas.
 */

const SYNC = {
  clientId: 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
  liberado: false,

  // Inicializa verificação de status
  init() {
    this.verificarStatus();
  },

  // Consulta o servidor para saber se o sistema está liberado ou bloqueado
  async verificarStatus() {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        this.handleAuthEvent(data);
      }
    } catch (e) {
      console.warn('Erro ao verificar status de autenticação:', e);
    }
  },

  // Trata o evento de autenticação (recebido via SSE ou verificação direta)
  handleAuthEvent(data) {
    if (!data) return;
    this.liberado = Boolean(data.liberado);

    if (this.liberado) {
      this.esconderModalPin();
    } else {
      this.mostrarModalPin();
    }
  },

  // Exibe o modal de PIN
  mostrarModalPin() {
    let overlay = document.getElementById('pinModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pinModalOverlay';
      overlay.className = 'pin-modal-overlay';
      overlay.innerHTML = `
        <div class="pin-modal-card" id="pinModalCard">
          <div class="pin-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 class="pin-modal-title">Acesso Bloqueado</h2>
          <p class="pin-modal-desc">Digite o PIN para liberar a exibição e o controle de todas as telas.</p>
          
          <form class="pin-form" id="pinForm">
            <input 
              type="password" 
              class="pin-input-field" 
              id="pinInputField" 
              placeholder="••••••" 
              maxlength="6" 
              inputmode="numeric" 
              autocomplete="off" 
              autofocus 
              required
            />
            <div class="pin-error-msg" id="pinErrorMsg"></div>
            <button type="submit" class="pin-submit-btn" id="pinSubmitBtn">
              <span>Liberar Acesso</span>
            </button>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      const form = document.getElementById('pinForm');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = document.getElementById('pinInputField').value;
        this.enviarPin(pin);
      });
    }

    overlay.style.display = 'flex';
    const input = document.getElementById('pinInputField');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 100);
    }
    const errorMsg = document.getElementById('pinErrorMsg');
    if (errorMsg) errorMsg.textContent = '';
  },

  // Esconde o modal de PIN
  esconderModalPin() {
    const overlay = document.getElementById('pinModalOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  },

  // Envia o PIN para validação no backend
  async enviarPin(pin) {
    const errorMsg = document.getElementById('pinErrorMsg');
    const submitBtn = document.getElementById('pinSubmitBtn');
    const card = document.getElementById('pinModalCard');

    if (errorMsg) errorMsg.textContent = '';
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const data = await res.json();
      if (res.ok && data.liberado) {
        this.liberado = true;
        this.esconderModalPin();
      } else {
        if (errorMsg) errorMsg.textContent = data.erro || 'PIN incorreto. Tente novamente.';
        if (card) {
          card.classList.remove('pin-shake');
          void card.offsetWidth;
          card.classList.add('pin-shake');
        }
        const input = document.getElementById('pinInputField');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    } catch (e) {
      if (errorMsg) errorMsg.textContent = 'Erro de conexão ao validar PIN.';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  // Envia atualização de estado para o servidor replicar para todas as telas
  send(partialState) {
    try {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          state: partialState
        })
      }).catch(err => console.warn('Falha ao sincronizar ação:', err));
    } catch (e) {
      console.warn('Erro na requisição de sincronização:', e);
    }
  },

  // Trata o evento de sincronização recebido via SSE
  handleSyncEvent(data) {
    if (!data) return;

    // Se o evento foi gerado pelo próprio dispositivo, ignora para evitar loop
    if (data.senderId && data.senderId === this.clientId) {
      return;
    }

    const pathname = window.location.pathname.toLowerCase();
    const isJogosPage = pathname.includes('jogos.html');

    // Troca de tela global (Tabela ↔ Jogos)
    if (data.tela === 'jogos' && !isJogosPage) {
      const queryRodada = data.rodada ? `&rodada=${data.rodada}` : '';
      window.location.href = `jogos.html?serie=${data.serie || 'a'}${queryRodada}`;
      return;
    }

    if (data.tela === 'tabela' && isJogosPage) {
      window.location.href = `index.html?serie=${data.serie || 'a'}`;
      return;
    }

    // Se continuar na mesma página, notifica o listener local registrado
    if (typeof window.onSyncStateReceived === 'function') {
      window.onSyncStateReceived(data);
    }
  }
};

// Inicia verificação assim que o script carregar
document.addEventListener('DOMContentLoaded', () => {
  SYNC.init();
});
