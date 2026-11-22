(function () {
  'use strict';
  const USERS_KEY = 'nmstudio_users_v1';
  const SESSION_KEY = 'nmstudio_session_v1';
  const demoUsers = [
    { id: 'demo-listener', name: 'Jordan Listener', email: 'user@nmstudio.local', password: 'listen123', role: 'customer', demo: true },
    { id: 'demo-studio', name: 'NM Studio', email: 'admin@nmstudio.local', password: 'studio123', role: 'admin', demo: true }
  ];
  let users = [];
  let currentUser = null;

  function save() {
    NMStorage.set(USERS_KEY, users);
    if (currentUser) NMStorage.set(SESSION_KEY, currentUser.id);
    else NMStorage.remove(SESSION_KEY);
  }

  function init() {
    const storedUsers = NMStorage.get(USERS_KEY, []);
    users = Array.isArray(storedUsers) ? storedUsers.filter(function (user) {
      return user && typeof user.id === 'string' && typeof user.email === 'string';
    }) : [];
    demoUsers.forEach(function (demo) {
      if (!users.some(function (user) { return user.id === demo.id; })) users.push(demo);
    });
    const sessionId = NMStorage.get(SESSION_KEY, null);
    currentUser = users.find(function (user) { return user.id === sessionId; }) || null;
    save();
    return currentUser;
  }

  function signIn(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
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
    if (users.some(function (user) { return user.email.toLowerCase() === email; })) throw new Error('An account with that email already exists on this device.');
    const user = {
      id: 'user-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
      name: name,
      email: email,
      password: password,
      role: data.role === 'admin' ? 'admin' : 'customer',
      demo: false
    };
    users.push(user);
    currentUser = user;
    save();
    return currentUser;
  }

  function demoLogin(role) {
    const user = users.find(function (candidate) { return candidate.id === (role === 'admin' ? 'demo-studio' : 'demo-listener'); });
    if (!user) throw new Error('The local demo account is unavailable.');
    user.role = role === 'admin' ? 'admin' : 'customer';
    currentUser = user;
    users = users.map(function (candidate) { return candidate.id === user.id ? user : candidate; });
    save();
    return currentUser;
  }

  function switchDemoRole() {
    if (!currentUser || !currentUser.demo) throw new Error('Role switching is available for demo accounts only.');
    const role = currentUser.role === 'admin' ? 'customer' : 'admin';
    currentUser.role = role;
    users = users.map(function (user) { return user.id === currentUser.id ? currentUser : user; });
    save();
    return currentUser;
  }

  function signOut() {
    currentUser = null;
    save();
  }

  function getUsers() {
    return users.map(function (user) {
      return { id: user.id, name: user.name, email: user.email, role: user.role, demo: Boolean(user.demo) };
    });
  }

  window.NMAuth = {
    init: init,
    signIn: signIn,
    signUp: signUp,
    demoLogin: demoLogin,
    switchDemoRole: switchDemoRole,
    signOut: signOut,
    getCurrentUser: function () { return currentUser; },
    getUsers: getUsers
  };
}());
