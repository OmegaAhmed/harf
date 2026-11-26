const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
let csrfToken = '';

export function getApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = configuredBaseUrl.replace(/\/+$/, '');
  const apiUrl = baseUrl ? new URL(normalizedPath, `${baseUrl}/`) : new URL(normalizedPath, window.location.origin);

  if (window.location.protocol === 'https:' && apiUrl.protocol !== 'https:') {
    throw new Error('The API must use HTTPS when the application is served over HTTPS.');
  }

  return apiUrl.toString();
}

export function setCsrfToken(token) {
  csrfToken = typeof token === 'string' ? token : '';
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableResponse(response, payload) {
  if ([502, 504].includes(response.status)) return true;
  return response.status === 503
    && ['DATABASE_UNAVAILABLE', 'SERVICE_UNAVAILABLE'].includes(payload?.error?.code);
}

function fallbackErrorMessage(status, code) {
  if (status >= 500) return 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة بعد قليل.';
  if (code === 'INVALID_CREDENTIALS') return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (code === 'AUTHENTICATION_REQUIRED') return 'سجّل الدخول للمتابعة.';
  if (status === 401) return 'تعذر التحقق من الحساب. راجع البيانات أو سجّل الدخول مجددًا.';
  if (status === 403) return 'ليس لديك صلاحية تنفيذ هذا الإجراء.';
  if (status === 404) return 'المحتوى المطلوب غير متاح.';
  if (status === 409) return 'تعذر إتمام الإجراء بسبب تعارض في البيانات. حدّث الصفحة وحاول مرة أخرى.';
  if (status === 413) return 'حجم الملف أو البيانات أكبر من المسموح.';
  if (status === 429) return 'تجاوزت عدد المحاولات المسموح. انتظر قليلًا ثم حاول مجددًا.';
  return 'تعذر إتمام الطلب. راجع البيانات وحاول مرة أخرى.';
}

function createApiError(response, payload) {
  const serverMessage = payload?.error?.message;
  const message = typeof serverMessage === 'string' && /[\u0600-\u06FF]/.test(serverMessage)
    ? serverMessage
    : fallbackErrorMessage(response.status, payload?.error?.code);
  const error = new Error(message);
  error.status = response.status;
  error.code = payload?.error?.code;
  error.details = payload?.error?.details;
  return error;
}

export async function apiRequest(path, options = {}) {
  const { retryTransientResponses = false, ...requestOptions } = options;
  const method = (requestOptions.method ?? 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...requestOptions.headers
  };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const request = {
    ...requestOptions,
    method,
    credentials: 'include',
    headers
  };
  const retryDelays = [300, 900];

  for (let attempt = 0; ; attempt += 1) {
    const apiUrl = getApiUrl(path);
    let response;
    try {
      response = await fetch(apiUrl, request);
    } catch (requestError) {
      if (!(requestError instanceof TypeError)) throw requestError;
      const error = new Error('تعذر الاتصال بالخدمة. تحقق من اتصالك بالإنترنت ثم حاول مجددًا.');
      error.code = 'NETWORK_ERROR';
      throw error;
    }
    if (response.ok) {
      if (response.status === 204) return null;
      return response.json();
    }

    const payload = await response.json().catch(() => null);
    if ((method === 'GET' || retryTransientResponses)
      && attempt < retryDelays.length
      && isRetryableResponse(response, payload)) {
      await wait(retryDelays[attempt]);
      continue;
    }
    throw createApiError(response, payload);
  }
}
