(function () {
  "use strict";

  const URL = "https://zrawtpvuvnkrsoewhhws.supabase.co";
  const KEY = "sb_publishable__dGQU6oQ6u4WXLLb8UZJkg_6UTIu0CI";

  const button = document.getElementById("piLoginButton");
  const notice = document.getElementById("piNotice");
  const dialog = document.querySelector("#profileModal .dialogbuttons");

  if (!button || !notice || !dialog) return;

  if (!window.supabase) {
    console.error("Supabase SDK unavailable");
    return;
  }

  const db = window.supabase.createClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  const labels = {
    fa: ["ورود با Pi", "خروج از حساب", "با حساب پای وارد شوید."],
    en: ["Sign in with Pi", "Sign out", "Sign in with your Pi account."],
    ku: ["چوونەژوورەوە بە Pi", "چوونەدەرەوە", "بە هەژماری Pi بچۆ ژوورەوە."],
    ar: ["الدخول عبر Pi", "تسجيل الخروج", "سجل الدخول بحساب Pi."],
    tr: ["Pi ile giriş", "Çıkış yap", "Pi hesabınızla giriş yapın."],
    de: ["Mit Pi anmelden", "Abmelden", "Mit deinem Pi-Konto anmelden."],
    fr: ["Connexion avec Pi", "Déconnexion", "Connectez-vous avec Pi."],
    es: ["Entrar con Pi", "Cerrar sesión", "Inicia sesión con Pi."],
    zh: ["使用 Pi 登录", "退出登录", "使用 Pi 账户登录。"],
    ja: ["Piでログイン", "ログアウト", "Piアカウントでログイン。"],
    hi: ["Pi से लॉगिन", "लॉग आउट", "अपने Pi खाते से लॉगिन करें।"]
  };

  let piUser = null;
  let busy = false;
  let initialized = false;
  let ready = false;

  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "cancel";
  logout.style.display = "none";
  dialog.appendChild(logout);

  function updatePi() {
    const l = labels[lang] || labels.en;

    button.textContent = "π " + (piUser || l[0]);
    notice.textContent = piUser ? "Pi: " + piUser + " ✓" : l[2];

    logout.textContent = l[1];
    logout.style.display = piUser ? "block" : "none";

    button.disabled = busy || !ready;
    logout.disabled = busy;
  }

  function restoreUser(session) {
    const user = session?.user;

    piUser = user?.app_metadata?.pi_uid
      ? user?.user_metadata?.pi_username || null
      : null;

    updatePi();
  }

  db.auth.onAuthStateChange(function (event, session) {
    restoreUser(session);
  });

  db.auth.getSession()
    .then(function ({ data, error }) {
      if (error) throw error;
      restoreUser(data.session);
    })
    .catch(function () {
      piUser = null;
    })
    .finally(function () {
      ready = true;
      updatePi();
    });

  button.onclick = async function () {
    if (busy || !ready) return;

    if (piUser) {
      profile();
      return;
    }

    busy = true;
    updatePi();

    try {
      if (!window.Pi) {
        throw new Error("Open PiLoop in Pi Browser");
      }

      if (!initialized) {
        Pi.init({
          version: "2.0",
          sandbox: false
        });

        initialized = true;
      }

      const auth = await Pi.authenticate(
        ["username"],
        function () {
          console.warn("Incomplete payment");
        }
      );

      const response = await fetch(
        URL + "/functions/v1/pi-auth-verify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            accessToken: auth.accessToken
          })
        }
      );

      const verified = await response.json();

      if (
        !response.ok ||
        verified.success !== true ||
        !verified.user?.uid ||
        !verified.user?.username
      ) {
        throw new Error("Pi verification failed");
      }

      if (
        !verified.session?.access_token ||
        !verified.session?.refresh_token
      ) {
        throw new Error("Session not received");
      }

      const { data, error } = await db.auth.setSession({
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token
      });

      if (error || !data.session) {
        throw new Error("Session activation failed");
      }

      if (
        data.user?.id !== verified.user.profile_id ||
        data.user?.app_metadata?.pi_uid !== verified.user.uid
      ) {
        await db.auth.signOut({ scope: "local" });
        throw new Error("Account mismatch");
      }

      piUser = verified.user.username;
      updatePi();
      profile();

    } catch (error) {
      alert("Pi Error: " + error.message);
    } finally {
      busy = false;
      updatePi();
    }
  };

  logout.onclick = async function () {
    if (busy) return;

    busy = true;
    updatePi();

    try {
      const { error } = await db.auth.signOut({
        scope: "local"
      });

      if (error) throw error;

      piUser = null;
      closeModal("profileModal");

    } catch (error) {
      alert("Logout Error: " + error.message);
    } finally {
      busy = false;
      updatePi();
    }
  };

  document.getElementById("languageSelect")
    .addEventListener("change", updatePi);

  updatePi();

})();
