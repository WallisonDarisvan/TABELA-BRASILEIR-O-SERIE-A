/**
 * SINCRONIZAÇÃO GLOBAL EM TEMPO REAL (SYNC)
 * Permite que qualquer dispositivo (TV, celular, tablet, computador) controle
 * e espelhe todas as ações instantaneamente em todas as telas abertas.
 */

const SYNC = {
  clientId: 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
  
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
