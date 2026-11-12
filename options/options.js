/**
 * Raindrop Secondary Saver - Options Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusLoading = document.getElementById('statusLoading');
  const connectedState = document.getElementById('connectedState');
  const disconnectedState = document.getElementById('disconnectedState');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const userProBadge = document.getElementById('userProBadge');

  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const tokenOptionsForm = document.getElementById('tokenOptionsForm');
  const tokenInput = document.getElementById('tokenInput');
  const toggleVisibilityBtn = document.getElementById('toggleVisibilityBtn');
  const saveTokenBtn = document.getElementById('saveTokenBtn');
  const saveSpinner = document.getElementById('saveSpinner');
  const saveBtnText = document.getElementById('saveBtnText');
  const statusBanner = document.getElementById('statusBanner');

  function showBanner(message, type = 'info', autoHideMs = 6000) {
    statusBanner.textContent = message;
    statusBanner.className = `banner ${type}`;
    statusBanner.classList.remove('hidden');

    if (autoHideMs > 0) {
      setTimeout(() => {
        if (statusBanner.textContent === message) {
          statusBanner.classList.add('hidden');
        }
      }, autoHideMs);
    }
  }

  function hideBanner() {
    statusBanner.classList.add('hidden');
    statusBanner.textContent = '';
  }

  function renderConnected(user) {
    statusLoading.classList.add('hidden');
    disconnectedState.classList.add('hidden');
    connectedState.classList.remove('hidden');

    userName.textContent = user.fullName || user.name || 'Account B';
    userEmail.textContent = user.email || 'No email provided';

    if (user.avatar) {
      userAvatar.textContent = '';
      userAvatar.style.backgroundImage = `url(${user.avatar})`;
      userAvatar.style.backgroundSize = 'cover';
    } else {
      userAvatar.style.backgroundImage = 'none';
      const initial = (user.fullName || user.email || 'B').charAt(0).toUpperCase();
      userAvatar.textContent = initial;
    }

    if (user.pro) {
      userProBadge.classList.remove('hidden');
    } else {
      userProBadge.classList.add('hidden');
    }
  }

  function renderDisconnected() {
    statusLoading.classList.add('hidden');
    connectedState.classList.add('hidden');
    disconnectedState.classList.remove('hidden');
  }

  // Check connection status
  async function checkConnection(token) {
    if (!token) {
      renderDisconnected();
      return;
    }

    statusLoading.classList.remove('hidden');
    connectedState.classList.add('hidden');
    disconnectedState.classList.add('hidden');

    try {
      const user = await RaindropAPI.verifyToken(token);
      await RaindropStorage.setUser(user);
      renderConnected(user);
    } catch (err) {
      console.warn('Connection check failed:', err);
      renderDisconnected();
      showBanner(`Authentication check failed: ${err.message}`, 'error', 0);
    }
  }

  // Toggle token input visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      toggleVisibilityBtn.textContent = '🔒';
    } else {
      tokenInput.type = 'password';
      toggleVisibilityBtn.textContent = '👁';
    }
  });

  // Save Token Form
  tokenOptionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner();

    const token = RaindropStorage.sanitizeToken(tokenInput.value);

    if (!token) {
      showBanner('Please provide a valid token.', 'warning');
      return;
    }

    saveTokenBtn.disabled = true;
    saveSpinner.classList.remove('hidden');
    saveBtnText.textContent = 'Verifying...';

    try {
      // 1. Verify token and ensure valid account identity
      const user = await RaindropAPI.verifyToken(token);
      if (!user || user._id === undefined) {
        throw new Error('Could not verify account identity.');
      }

      // 2. Check if switching accounts or replacing token
      const existingToken = await RaindropStorage.getToken();
      const existingUser = await RaindropStorage.getUser();
      const isDifferent = (existingToken && existingToken !== token) || (existingUser && existingUser._id !== user._id);
      if (isDifferent) {
        // Clear old account state to prevent cross-account bleed (F-07)
        await RaindropStorage.clearAccountData();
      }

      // 3. Save new verified token and user
      await RaindropStorage.setToken(token);
      await RaindropStorage.setUser(user);

      // 4. Mask token in UI (F-14)
      tokenInput.value = '';
      tokenInput.placeholder = `Connected (••••${token.slice(-4)}) - enter new token to switch`;

      renderConnected(user);
      showBanner(`Connected to ${user.fullName || user.email || 'Account B'} successfully!`, 'success');
    } catch (err) {
      console.error('Failed to verify token:', err);
      showBanner(`Failed to verify token: ${err.message}`, 'error', 0);
    } finally {
      saveTokenBtn.disabled = false;
      saveSpinner.classList.add('hidden');
      saveBtnText.textContent = 'Save & Verify Token';
    }
  });

  // Test Connection Button
  testConnectionBtn.addEventListener('click', async () => {
    hideBanner();
    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = 'Testing...';

    const storedToken = await RaindropStorage.getToken();
    const rawInput = tokenInput.value;
    const token = rawInput ? RaindropStorage.sanitizeToken(rawInput) : storedToken;

    if (!token) {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
      showBanner('No token entered. Please provide a Personal Access Token first.', 'warning');
      return;
    }

    try {
      const user = await RaindropAPI.verifyToken(token);
      await RaindropStorage.setUser(user);
      renderConnected(user);
      showBanner(`Connection OK! Raindrop.io verified for ${user.fullName || user.email}.`, 'success');
    } catch (err) {
      showBanner(`Connection test failed: ${err.message}`, 'error', 0);
    } finally {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
    }
  });

  // Disconnect Button
  disconnectBtn.addEventListener('click', async () => {
    if (confirm('Disconnect this extension from your secondary Raindrop account?')) {
      await RaindropStorage.clearToken();
      tokenInput.value = '';
      tokenInput.placeholder = 'Paste your test token here...';
      renderDisconnected();
      showBanner('Disconnected. Extension token cleared.', 'info');
    }
  });

  // Initial Load
  const [storedToken, cachedUser] = await Promise.all([
    RaindropStorage.getToken(),
    RaindropStorage.getUser()
  ]);

  if (cachedUser && storedToken) {
    renderConnected(cachedUser);
  }

  if (storedToken) {
    tokenInput.value = '';
    tokenInput.placeholder = `Connected (••••${storedToken.slice(-4)}) - enter new token to switch`;
  }
  await checkConnection(storedToken);
});
