import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

import { clearStoredToken, getStoredToken, setStoredToken } from '@/constants/auth'
import { env } from '@/env'
import { useNetworkStore } from '@/store/useNetworkStore'
import { useServerStore } from '@/store/useServerStore'

import ApiError, { getApiErrorDetails } from '../apiError'
import { API_ROUTES } from '../apiRoutes'
import { getUserErrorMessage } from '../errorMessages'

/**
 * The HTTP room endpoints (`/rooms`, `/rooms/:id`) are served on the same host as
 * the Socket.io signaling server, so the API base URL is the socket URL.
 */
const BASE_URL = env.socketUrl
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
}
const DEFAULT_TIMEOUT = 10000

interface AuthHandlers {
  onSessionExpired: (() => void) | null
  onPermissionDenied: (() => void) | null
}

let authHandlers: AuthHandlers = {
  onSessionExpired: null,
  onPermissionDenied: null,
}

/**
 * Register app-level reactions to auth failures. `onSessionExpired` fires only
 * when a 401 could not be recovered by a token refresh (the session is truly
 * gone); `onPermissionDenied` fires on 403.
 */
export const setAuthHandlers = (handlers: AuthHandlers): void => {
  authHandlers = handlers
}

/**
 * Trigger the registered session-expired reaction (toast + local sign-out) from
 * outside the HTTP flow — e.g. when the socket handshake can't be re-authenticated.
 */
export const notifySessionExpired = (): void => {
  authHandlers.onSessionExpired?.()
}

/**
 * A bare client for the refresh call so it doesn't recurse through the response
 * interceptor below. The refresh token travels as an httpOnly cookie
 * (`withCredentials`), so no body/token is needed here.
 */
const refreshClient = axios.create({ baseURL: BASE_URL, withCredentials: true })

let refreshInFlight: Promise<string | null> | null = null

/**
 * Rotate the refresh cookie → a new access token, storing it. Deduped across
 * concurrent callers (HTTP 401 retries *and* the socket handshake share one call).
 * Returns the new token, or null if the session can't be refreshed.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async (): Promise<string | null> => {
    try {
      const { data } = await refreshClient.post(API_ROUTES.AUTH.REFRESH)
      const token = (data as { accessToken?: unknown })?.accessToken
      if (typeof token === 'string' && token) {
        setStoredToken(token)
        return token
      }
      return null
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** Endpoints whose 401 is terminal (a credential failure), never a stale session. */
const NO_REFRESH_RETRY = [
  API_ROUTES.AUTH.LOGIN,
  API_ROUTES.AUTH.REGISTER,
  API_ROUTES.AUTH.GOOGLE,
  API_ROUTES.AUTH.REFRESH,
  API_ROUTES.AUTH.LOGOUT,
]

const skipsRefresh = (url?: string): boolean =>
  !!url && NO_REFRESH_RETRY.some((route) => url.endsWith(route))

const interceptRequest = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

const interceptSuccessResponse = (response: AxiosResponse): AxiosResponse | Promise<never> => {
  // We got a response, so the server answered (even a `success: false` envelope).
  useServerStore.getState().setStatus('up')

  const { data, config } = response

  // Binary downloads (`responseType: 'blob'`) are not JSON envelopes.
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return response
  }

  let parsedData: Record<string, unknown> = {}
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data)
    } catch {
      // non-JSON body — treat as success
    }
  } else if (data && typeof data === 'object') {
    parsedData = data as Record<string, unknown>
  }

  if (parsedData.success === false) {
    const errors = Array.isArray(parsedData.errors) ? parsedData.errors : []
    const serverMessage = typeof parsedData.message === 'string' ? parsedData.message : ''
    const { code, message: errorMessage } = getApiErrorDetails(errors)
    const resolvedMessage = errorMessage || serverMessage
    const userMessage = getUserErrorMessage(config.url ?? '', config.method)

    return Promise.reject(
      new ApiError(code ?? '', response.status, resolvedMessage, '', userMessage)
    )
  }

  return response
}

const interceptErrorResponse = async (error: unknown): Promise<AxiosResponse> => {
  if (!axios.isAxiosError(error)) {
    return Promise.reject(error)
  }

  const defaultErrorMessage = `${error.name}: ${error.message}`

  if (!error.response) {
    // A request *we* aborted says nothing about the network. Letting it mark the
    // the server unreachable would strand the user behind a connection banner (and, on
    // the routes that need a backend, the server-down page) over a healthy server.
    if (axios.isCancel(error)) {
      return Promise.reject(new ApiError('', 0, defaultErrorMessage, error.code ?? '', ''))
    }

    // A request that ran out of time is not proof the server is gone — the far more
    // common cause is a link too slow to finish it. Calling that an outage sends the
    // user to a full-page "we're down" screen over a bad hotspot, so a timeout feeds
    // the connection-quality probe instead and leaves the server status alone. The
    // probe (`NetworkWatcher`) settles which it actually was.
    const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
    if (timedOut) {
      // Except from the probe itself, whose own result is already a sample — counting
      // it twice would let one slow probe convict the connection on its own.
      if (!error.config?.url?.endsWith(API_ROUTES.HEALTH)) {
        useNetworkStore.getState().reportTrouble()
      }
      const userMessage = getUserErrorMessage(error.config?.url ?? '', error.config?.method)
      return Promise.reject(new ApiError('', 0, defaultErrorMessage, error.code ?? '', userMessage))
    }

    // No response at all. Deliberately `unknown` and not `down`: a dead backend, a
    // captive portal, a DNS failure and a connection reset on a flaky radio all land
    // here looking identical, and `ERR_NETWORK` is the *usual* way a degrading link
    // fails — cleanly timing out is the exception, not the rule. Claiming an outage
    // here would tell someone on bad wifi that their connection looks fine.
    useServerStore.getState().setStatus('unknown')

    // Re-read the browser's flag at the moment of failure rather than trusting the
    // last `offline` event: this is the freshest signal we have, and it decides
    // whether the user is told to check their connection or to wait for us. An
    // endpoint's own copy ("couldn't save your profile") is misleading when nothing
    // left the device.
    const offline = !useNetworkStore.getState().refresh()
    const userMessage = offline
      ? 'errors.offline'
      : getUserErrorMessage(error.config?.url ?? '', error.config?.method)
    return Promise.reject(new ApiError('', 0, defaultErrorMessage, error.code ?? '', userMessage))
  }

  // A response (any status) means the server answered. Even a 5xx stays `up`: one
  // endpoint erroring is not an outage, and `down` is the probe's verdict to make.
  useServerStore.getState().setStatus('up')

  const { status, data, config } = error.response

  let parsedData: Record<string, unknown> = {}
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data)
    } catch {
      // non-JSON body — leave parsedData empty
    }
  } else if (data && typeof data === 'object') {
    parsedData = data as Record<string, unknown>
  }

  const errors = Array.isArray(parsedData.errors) ? parsedData.errors : []
  const serverMessage = typeof parsedData.message === 'string' ? parsedData.message : ''
  // Our auth backend returns `{ error: '<code>' }`; surface it as the ApiError code.
  const backendCode = typeof parsedData.error === 'string' ? parsedData.error : ''

  const { code: customErrorCode, message: errorMessage } = getApiErrorDetails(errors)
  const resolvedMessage = errorMessage || serverMessage || defaultErrorMessage
  const userMessage = getUserErrorMessage(config?.url ?? '', config?.method)

  const retryConfig = config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined

  if (
    status === 401 &&
    retryConfig &&
    !retryConfig._retried &&
    !skipsRefresh(config?.url) &&
    getStoredToken()
  ) {
    // A live session hit an expired access token — try one silent refresh + replay.
    retryConfig._retried = true
    const newToken = await refreshAccessToken()
    if (newToken) {
      retryConfig.headers.Authorization = `Bearer ${newToken}`
      return refreshClient.request(retryConfig)
    }
    // Refresh failed — the session is truly gone.
    clearStoredToken()
    authHandlers.onSessionExpired?.()
  } else if (status === 403) {
    authHandlers.onPermissionDenied?.()
  }

  return Promise.reject(
    new ApiError(
      customErrorCode || backendCode,
      status,
      resolvedMessage,
      error.code ?? '',
      userMessage
    )
  )
}

type RequestConfig = Omit<AxiosRequestConfig, 'headers'> & {
  headers?: Record<string, string>
}

class AxiosClient {
  private readonly client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: DEFAULT_TIMEOUT,
      headers: DEFAULT_HEADERS,
      // Send/receive the httpOnly refresh cookie on same-site cross-origin calls.
      withCredentials: true,
    })

    this.client.interceptors.request.use(interceptRequest)
    this.client.interceptors.response.use(interceptSuccessResponse, interceptErrorResponse)
  }

  static createCancelToken() {
    return axios.CancelToken.source()
  }

  getData<T = unknown>(
    url: string,
    params: Record<string, unknown> = {},
    { headers = {}, ...config }: RequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, {
      ...config,
      params,
      headers: { ...DEFAULT_HEADERS, ...headers },
    })
  }

  postData<T = unknown>(
    url: string,
    data?: unknown,
    { headers = {}, ...config }: RequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, {
      ...config,
      headers: { ...DEFAULT_HEADERS, ...headers },
    })
  }

  putData<T = unknown>(
    url: string,
    data?: unknown,
    { headers = {}, ...config }: RequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, {
      ...config,
      headers: { ...DEFAULT_HEADERS, ...headers },
    })
  }

  patchData<T = unknown>(
    url: string,
    data?: unknown,
    { headers = {}, ...config }: RequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, {
      ...config,
      headers: { ...DEFAULT_HEADERS, ...headers },
    })
  }

  deleteData<T = unknown>(
    url: string,
    { headers = {}, ...config }: RequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, {
      ...config,
      headers: { ...DEFAULT_HEADERS, ...headers },
    })
  }
}

export default AxiosClient
