/* ============================================
   NT ELEGANZ — SUPABASE AUTH MODULE
   ============================================ */

(function () {
  'use strict';

  const SUPABASE_URL = 'https://erpyzjxtxztokpxxpirq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vvD9OIWTX6dzYm9fFTa4yw_aRLZfYwU';
  let client = null;
  let currentUser = null;
  let clientPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o Supabase Auth.'));
      document.head.appendChild(script);
    });
  }

  async function getClient() {
    if (client) return client;
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!window.supabase?.createClient) {
          await loadScript('/js/vendor/supabase.min.js');
        }
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        client.auth.onAuthStateChange((_event, session) => {
          currentUser = session?.user || null;
        });
        return client;
      })();
    }
    return clientPromise;
  }

  async function hasAdminAccess(authClient, user) {
    const { data, error } = await authClient
      .from('admin_users')
      .select('role, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    return data?.role === 'admin';
  }

  async function login(email, password) {
    try {
      const authClient = await getClient();
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: 'E-mail ou senha inválidos.' };
      if (!data.user || !(await hasAdminAccess(authClient, data.user))) {
        await authClient.auth.signOut();
        return { success: false, error: 'Este usuário não possui acesso ao painel.' };
      }
      currentUser = data.user;
      return { success: true };
    } catch (error) {
      console.error('Falha no login:', error);
      return { success: false, error: 'Não foi possível autenticar. Tente novamente.' };
    }
  }

  async function isAuthenticated() {
    try {
      const authClient = await getClient();
      const { data, error } = await authClient.auth.getSession();
      if (error || !data.session?.user) return false;
      currentUser = data.session.user;
      return hasAdminAccess(authClient, currentUser);
    } catch {
      return false;
    }
  }

  async function requireAuth() {
    if (!(await isAuthenticated())) {
      window.location.href = '../admin/login.html';
      return false;
    }
    return true;
  }

  async function logout() {
    const authClient = await getClient();
    await authClient.auth.signOut();
    currentUser = null;
    window.location.href = '../admin/login.html';
  }

  async function changePassword(_currentPass, newPass) {
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'Nova senha precisa ter pelo menos 6 caracteres.' };
    }
    try {
      const authClient = await getClient();
      const { error } = await authClient.auth.updateUser({ password: newPass });
      return error ? { success: false, error: error.message } : { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function changeUsername(_currentPass, newEmail) {
    if (!newEmail || !newEmail.includes('@')) {
      return { success: false, error: 'Informe um e-mail válido.' };
    }
    try {
      const authClient = await getClient();
      const { data, error } = await authClient.auth.updateUser({ email: newEmail });
      if (error) return { success: false, error: error.message };
      currentUser = data.user;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  window.ntAuth = {
    login,
    logout,
    isAuthenticated,
    requireAuth,
    changePassword,
    changeUsername,
    getClient,
    getUsername: () => currentUser?.email || '',
  };
})();
