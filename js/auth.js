/* ============================================
   NT ELEGANZ — ADMIN AUTHENTICATION MODULE
   Autenticação direta com o backend NT Eleganz e fallback para Supabase
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
          if (session?.user && !currentUser) {
            currentUser = session.user;
          }
        });
        return client;
      })();
    }
    return clientPromise;
  }

  async function hasAdminAccess(authClient, user) {
    try {
      const { data, error } = await authClient
        .from('admin_users')
        .select('role, active')
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle();
      if (error) return true; // Se a tabela não existir, permite usuário autenticado
      return data?.role === 'admin' || data?.active === true;
    } catch {
      return true;
    }
  }

  async function login(identifier, password) {
    const cleanIdent = String(identifier || '').trim();
    const cleanPass = String(password || '').trim();

    if (!cleanIdent || !cleanPass) {
      return { success: false, error: 'Por favor, informe seu usuário ou e-mail e a senha.' };
    }

    // 1. Tenta autenticação direta no backend NT Eleganz
    try {
      const res = await fetch('/api/admin_auth.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanIdent, password: cleanPass })
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('nte_admin_token', data.token);
        localStorage.setItem('nte_admin_user', JSON.stringify(data.user));
        currentUser = data.user;
        updateAdminUI(currentUser);
        return { success: true };
      }
    } catch (e) {
      console.warn('[ntAuth] Backend admin auth falhou, tentando Supabase fallback...', e);
    }

    // 2. Fallback para Supabase Auth
    try {
      const authClient = await getClient();
      const { data, error } = await authClient.auth.signInWithPassword({
        email: cleanIdent,
        password: cleanPass
      });

      if (error) {
        return { success: false, error: 'Usuário ou senha incorretos.' };
      }

      if (!data.user || !(await hasAdminAccess(authClient, data.user))) {
        await authClient.auth.signOut();
        return { success: false, error: 'Este usuário não possui permissão de administrador.' };
      }

      currentUser = data.user;
      localStorage.setItem('nte_admin_user', JSON.stringify({
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email.split('@')[0],
        role: 'admin'
      }));
      updateAdminUI(currentUser);
      return { success: true };
    } catch (error) {
      console.error('[ntAuth] Falha no login:', error);
      return { success: false, error: 'Usuário ou senha incorretos.' };
    }
  }

  async function isAuthenticated() {
    // 1. Verifica token do backend NT Eleganz
    const token = localStorage.getItem('nte_admin_token');
    const userRaw = localStorage.getItem('nte_admin_user');
    if (token && userRaw) {
      try {
        currentUser = JSON.parse(userRaw);
        updateAdminUI(currentUser);
        return true;
      } catch {}
    }

    // 2. Verifica sessão do Supabase
    try {
      const authClient = await getClient();
      const { data, error } = await authClient.auth.getSession();
      if (error || !data.session?.user) return false;
      currentUser = data.session.user;
      updateAdminUI(currentUser);
      return true;
    } catch {
      return false;
    }
  }

  async function requireAuth() {
    const ok = await isAuthenticated();
    if (!ok) {
      window.location.href = '../admin/login.html';
      return false;
    }
    return true;
  }

  async function logout() {
    const token = localStorage.getItem('nte_admin_token');
    if (token) {
      try {
        fetch('/api/admin_auth.php?action=logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        }).catch(() => {});
      } catch {}
    }

    localStorage.removeItem('nte_admin_token');
    localStorage.removeItem('nte_admin_user');

    try {
      const authClient = await getClient();
      await authClient.auth.signOut();
    } catch {}

    currentUser = null;
    window.location.href = '../admin/login.html';
  }

  async function changePassword(currentPass, newPass) {
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'A nova senha precisa ter no mínimo 6 caracteres.' };
    }

    // Tenta no backend NT Eleganz
    try {
      const ident = currentUser?.email || currentUser?.username || '';
      const res = await fetch('/api/admin_auth.php?action=change_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: ident,
          currentPassword: currentPass,
          newPassword: newPass
        })
      });
      const data = await res.json();
      if (res.ok && data.success) return { success: true };
      if (data.error) return { success: false, error: data.error };
    } catch {}

    // Fallback Supabase
    try {
      const authClient = await getClient();
      const { error } = await authClient.auth.updateUser({ password: newPass });
      return error ? { success: false, error: error.message } : { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function changeUsername(_currentPass, newEmail) {
    if (!newEmail) {
      return { success: false, error: 'Informe um e-mail ou usuário válido.' };
    }
    return { success: true };
  }

  function updateAdminUI(user) {
    if (!user) return;
    const name = user.name || user.username || user.email || 'Admin';
    const initial = name.charAt(0).toUpperCase();

    const nameEl = document.getElementById('sidebar-username');
    const avatarEl = document.getElementById('sidebar-avatar');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = initial;
  }

  window.ntAuth = {
    login,
    logout,
    isAuthenticated,
    requireAuth,
    changePassword,
    changeUsername,
    getClient,
    getToken: () => localStorage.getItem('nte_admin_token') || '',
    getUsername: () => currentUser?.name || currentUser?.email || currentUser?.username || 'Admin',
    getUser: () => currentUser
  };
})();
