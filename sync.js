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
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;';
      overlay.innerHTML = `
        <div class="pin-modal-card" id="pinModalCard" style="background:#ffffff;border-radius:18px;padding:36px 28px;width:100%;max-width:390px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.35);border:1px solid #e2e8f0;box-sizing:border-box;">
          <div class="pin-icon-wrapper" style="width:58px;height:58px;border-radius:50%;background:#ecfdf5;color:#00a854;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 4px 14px rgba(0,168,84,0.2);">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00a854" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;max-width:28px;max-height:28px;display:block;">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 class="pin-modal-title" style="font-size:1.45rem;font-weight:800;color:#0f172a;margin:0 0 8px;">Acesso Bloqueado</h2>
          <p class="pin-modal-desc" style="font-size:0.92rem;color:#64748b;margin:0 0 20px;line-height:1.4;">Digite o PIN para liberar a exibição e o controle de todas as telas.</p>
          
          <form class="pin-form" id="pinForm" style="display:flex;flex-direction:column;gap:12px;">
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
              style="width:100%;font-size:1.8rem;letter-spacing:0.35em;text-align:center;padding:12px 14px;border:2px solid #cbd5e1;border-radius:10px;outline:none;background:#f8fafc;box-sizing:border-box;color:#0f172a;"
            />
            <div class="pin-error-msg" id="pinErrorMsg" style="color:#ef4444;font-size:0.88rem;font-weight:600;min-height:20px;"></div>
            <button type="submit" class="pin-submit-btn" id="pinSubmitBtn" style="width:100%;padding:14px;background:#00a854;color:#ffffff;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;box-sizing:border-box;box-shadow:0 4px 14px rgba(0,168,84,0.3);">
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
    const payload = JSON.stringify({
      clientId: this.clientId,
      state: partialState
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/sync', blob);
      } else {
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(() => {});
      }
    } catch (e) {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
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

    // REDIRECIONAMENTO ENTRE TELAS (Tabela ↔ Jogos):
    // Apenas deve ocorrer quando houver um comando em tempo real enviado por OUTRO aparelho (senderId presente e diferente)
    // NUNCA redirecionar no evento inicial da conexão, permitindo que a página que o usuário acabou de abrir carregue normalmente!
    if (data.senderId && data.senderId !== this.clientId) {
      if (data.tela === 'jogos' && !isJogosPage) {
        const queryRodada = data.rodada ? `&rodada=${data.rodada}` : '';
        window.location.href = `jogos.html?serie=${data.serie || 'a'}${queryRodada}`;
        return;
      }

      if (data.tela === 'tabela' && isJogosPage) {
        window.location.href = `index.html?serie=${data.serie || 'a'}`;
        return;
      }
    }

    // Se continuar na mesma página, notifica o listener local registrado (para troca de série, rodada ou ordenação)
    if (typeof window.onSyncStateReceived === 'function') {
      window.onSyncStateReceived(data);
    }
  }
};

// Inicia verificação assim que o script carregar
document.addEventListener('DOMContentLoaded', () => {
  SYNC.init();

  // Avisa o servidor qual tela acabou de ser carregada
  const isJogos = window.location.pathname.toLowerCase().includes('jogos.html');
  SYNC.send({ tela: isJogos ? 'jogos' : 'tabela' });
});
