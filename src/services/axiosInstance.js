import axios from 'axios';
import qs from 'qs';
import secureStorage from '../utils/secureStorage';

const axiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
});

/**
 * Request interceptor — attaches zelidauth header for Flux API calls.
 *
 * The zelidauth stored in secureStorage includes private metadata fields
 * (_uid, _issuedAt, _loginType, _stickyBackend). These must be stripped
 * before URL-encoding so the Flux node doesn't reject the auth header.
 */
axiosInstance.interceptors.request.use(async (config) => {
  try {
    const zelidauth = await secureStorage.getItem('zelidauth');

    if (zelidauth?.zelid && zelidauth?.signature && zelidauth?.loginPhrase) {
      const { zelid, signature, loginPhrase } = zelidauth;
      config.headers.zelidauth = qs.stringify({ zelid, signature, loginPhrase });
    }
  } catch {
    // secureStorage unavailable (e.g., private mode) — proceed without auth
  }

  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Normalize network/timeout errors to readable messages
    if (!error.response) {
      const custom = new Error(
        error.code === 'ECONNABORTED'
          ? 'Request timed out. Please try again.'
          : 'Network error. Please check your connection.',
      );
      custom.code = error.code;
      return Promise.reject(custom);
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
