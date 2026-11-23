(function () {
  'use strict';
  const USERS_KEY = 'nmstudio_users_v1';
  const SESSION_KEY = 'nmstudio_session_v1';
  const demoAccountIds = ['demo-listener', 'demo-studio'];
  const demoAccountEmails = ['user@nmstudio.local', 'admin@nmstudio.local'];
  let users = [];
  let currentUser = null;

  function save() {
    NMStorage.set(USERS_KEY, users);
    if (currentUser) NMStorage.set(SESSION_KEY, currentUser.id);
    else NMStorage.remove(SESSION_KEY);
  }

  function shouldUseLocal(error) {
    const status = error && error.status;
    return !status || status === 0 || status === 404 || status === 405 || status >= 500 || (status >= 200 && status < 300);
  }

  function init() {
    const storedUsers = NMStorage.get(USERS_KEY, []);
    users = Array.isArray(storedUsers) ? storedUsers.filter(function (user) {
      return user && typeof user.id === 'string' && typeof user.email === 'string' &&
        user.demo !== true && !demoAccountIds.includes(user.id) &&
        !demoAccountEmails.includes(user.email.trim().toLowerCase());
    }) : [];
    currentUser = null;
    save();
    return null;
  }

  function signIn(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (window.NMDBClient && window.NMDBClient.isAvailable()) {
      return window.NMDBClient.signIn(normalizedEmail, password).then(function (user) {
        currentUser = user;
        save();
        return currentUser;
      }).catch(function (error) {
        if (!shouldUseLocal(error)) throw error;
        return signInLocal(normalizedEmail, password);
      });
    }
    return signInLocal(normalizedEmail, password);
  }

  function signInLocal(normalizedEmail, password) {
    const user = users.find(function (candidate) {
      return candidate.email.toLowerCase() === normalizedEmail && candidate.password === password;
    });
    if (!user) throw new Error('That email and password don’t match a local account.');
    currentUser = user;
    save();
    return currentUser;
  }

  function signUp(data) {
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (!name || !email || password.length < 4) throw new Error('Enter your name, a valid email, and a password of at least 4 characters.');
    if (window.NMDBClient && window.NMDBClient.isAvailable()) {
      return window.NMDBClient.signUp({ name: name, email: email, password: password, role: data.role })
        .then(function (user) {
          currentUser = user;
          save();
          return currentUser;
        }).catch(function (error) {
          if (!shouldUseLocal(error)) throw error;
          return signUpLocal({ name: name, email: email, password: password, role: data.role });
        });
    }
    return signUpLocal({ name: name, email: email, password: password, role: data.role });
  }

  function signUpLocal(data) {
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (users.some(function (user) { return user.email.toLowerCase() === email; })) throw new Error('An account with that email already exists on this device.');
    const user = {
      id: 'user-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
      name: name,
      email: email,
      password: password,
      role: data.role === 'admin' ? 'admin' : 'customer'
    };
    users.push(user);
    currentUser = user;
    save();
    return currentUser;
  }

  function signOut() {
    currentUser = null;
    save();
  }

  function getUsers() {
    return users.map(function (user) {
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    });
  }

  window.NMAuth = {
    init: init,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    getCurrentUser: function () { return currentUser; },
    getUsers: getUsers
  };
}());
