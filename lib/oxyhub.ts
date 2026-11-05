/**
 * Integração com o Oxyhub (login único dos sistemas Oxycom).
 * O login acontece no hub; o COODY só recebe a pessoa já autenticada (/api/hub).
 */
export const HUB_URL = (process.env.NEXT_PUBLIC_HUB_URL || 'https://hub.oxyhub.com.br').replace(/\/+$/, '');
export const HUB_SIGN_OUT = `${HUB_URL}/sair`;

const TRIED = 'oxyhub-login-redirect';
const LOCAL = 'oxyhub-login-local';

/**
 * Manda a pessoa para o login do Oxyhub, que devolve aqui já logada.
 * Não redireciona (mostra o login local) com ?local=1 ou se já tentamos há pouco
 * — evita ficar indo e voltando se algo der errado.
 */
export function goToHubLogin(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('local') === '1') sessionStorage.setItem(LOCAL, '1');
    if (sessionStorage.getItem(LOCAL) === '1') return false;
    const last = Number(sessionStorage.getItem(TRIED) || 0);
    if (Date.now() - last < 120_000) return false;
    sessionStorage.setItem(TRIED, String(Date.now()));
  } catch {
    /* sem sessionStorage: segue para o hub */
  }
  window.location.replace(`${HUB_URL}/abrir/coody`);
  return true;
}

/** Já logado: libera um novo redirecionamento no futuro. */
export function clearHubLoginAttempt() {
  try {
    sessionStorage.removeItem(TRIED);
  } catch {
    /* ignore */
  }
}
