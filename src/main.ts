import './style.css';

const status = document.querySelector('#readiness');
const button = document.querySelector<HTMLButtonElement>('#check-readiness');
if (!status || !button) throw new Error('Missing readiness controls');

const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = configuredUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

const checkReadiness = async () => {
  if (!apiBaseUrl) {
    status.textContent = 'The API address is not configured.';
    button.disabled = true;
    return;
  }

  status.textContent = 'Checking server…';
  button.disabled = true;
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/readyz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('status' in body)) {
      throw new Error('Invalid readiness response');
    }
    if (response.ok && body.status === 'ready') {
      status.textContent = 'Backend and database are ready.';
    } else if (response.status === 503 && body.status === 'unavailable') {
      status.textContent = 'The database is unavailable.';
    } else {
      throw new Error('Unexpected readiness response');
    }
  } catch {
    status.textContent = 'Could not check the backend.';
  } finally {
    button.disabled = false;
  }
};

button.addEventListener('click', checkReadiness);
void checkReadiness();
