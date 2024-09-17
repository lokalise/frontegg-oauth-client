import { z } from 'zod'

export interface FronteggUserData {
  externalUserId: string
  accessToken: string
  name: string
  email: string
  profilePictureUrl: string | null | undefined
  externalWorkspaceId: string
}

const GET_FRONTEGG_TOKEN_RESPONSE_SCHEMA = z.object({
  token_type: z.string(),
  access_token: z.string(),
  id_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
})

export type GetFronteggTokenResponse = z.infer<typeof GET_FRONTEGG_TOKEN_RESPONSE_SCHEMA>

/**
 * Frontegg specific error that contains extra fields for easier debugging.
 */
export class FronteggError extends Error {
  text: string
  status: number
  url: string
  // https://support.frontegg.com/hc/en-us/articles/7027392266525-How-do-I-find-the-frontegg-trace-id
  fronteggTraceId: string
  body: unknown

  constructor(options: {
    text: string
    status: number
    url: string
    fronteggTraceId: string
    body: unknown
  }) {
    super()
    this.name = 'FronteggError'

    this.text = options.text
    this.status = options.status
    this.url = options.url
    this.fronteggTraceId = options.fronteggTraceId
    this.body = options.body
  }

  override toString() {
    return this.message
  }

  override get message(): string {
    return JSON.stringify({
      text: this.text,
      status: this.status,
      url: this.url,
      fronteggTraceId: this.fronteggTraceId,
      body: this.body,
    })
  }
}

/**
 * Function to generate a random string
 * From https://sentry.io/answers/generate-random-string-characters-in-javascript/
 *
 * @param length the length of the generated string
 * @returns a random string
 */
const createRandomString = (length = 16) => {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

/**
 * Function to generate a new code verifier string or retrieve it from the local storage
 * Upon successful login on the hosted login page, we need to be able to reference the same `codeVerifier`
 * when calling `getFronteggUserTokenByCode` so that Frontegg can check that the passed code matches
 * the `codeVerifier` that was originally used to create the `code_challenge`.
 *
 * @returns a code verifier string
 */
const getCodeVerifier = async () => {
  const localStorageVerifier = localStorage.getItem('LOGIN_VERIFIER_KEY')

  if (localStorageVerifier) {
    return localStorageVerifier
  }

  const verifier = createRandomString()
  localStorage.setItem('LOGIN_VERIFIER_KEY', verifier)

  // Safari has a bug, where the localStorage value is not set if it is followed by redirect right after it.
  // To workaround this, we wait for a short period of time before returning the verifier.
  // See https://lokalise.atlassian.net/browse/AP-4043 for more details.
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, 200)
  })

  return verifier
}

/**
 * Fetch function that throws an error if the response is not ok.
 */
const fetchWithAssert = async (url: string, options: RequestInit) => {
  const response = await fetch(url, options)

  if (!response.ok) {
    const defaultMessage = 'Error while fetching Frontegg endpoint.'
    const text = (await response.text().catch(() => defaultMessage)) || defaultMessage
    const body: unknown = (await response.json().catch(() => defaultMessage)) || defaultMessage

    throw new FronteggError({
      text,
      url,
      fronteggTraceId: response.headers.get('frontegg-trace-id') ?? 'undefined',
      status: response.status,
      body,
    })
  }

  return response
}

/**
 * Function to calculate the expiration time of a token based on the number of seconds until it expires.
 *
 * @param expiresInSeconds the number of seconds until the token expires
 * @returns the time in milliseconds since epoch when the token expires
 */
const calculateTokenExpirationTime = (expiresInSeconds: number) => {
  return Date.now() + expiresInSeconds * 1000
}

/**
 * Function to check if a token is expired based on its expiration time.
 *
 * @param tokenExpirationTime time in milliseconds since epoch when the token expires
 * @returns boolean indicating whether the token is expired
 */
const isTokenExpired = (tokenExpirationTime: number | null) => {
  if (!tokenExpirationTime) {
    return true
  }
  // As a safety margin, we assume the token is expired 1 hour before the actual expiration time
  return tokenExpirationTime - 60 * 60 * 1000 < Date.now()
}

const GET_FRONTEGG_USER_DATA_RESPONSE_SCHEMA = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  profilePictureUrl: z.string().nullable().optional(),
  tenantId: z.string(),
})

export type GetFronteggUserDataResponse = z.infer<typeof GET_FRONTEGG_USER_DATA_RESPONSE_SCHEMA>

/**
 * Class providing a Frontegg OAuth login with AccessToken and UserData.
 * More information about native Frontegg authentication can be found at https://docs.frontegg.com/docs/native-hosted-login
 */
export class FronteggOAuthClient {
  /**
   * User data fetched from Frontegg.
   */
  public userData: FronteggUserData | null = null
  /**
   * Access token used to authenticate the user with Frontegg.
   */
  private accessToken: string | null = null
  /**
   * Refresh token used to get a new access token when the current one expires.
   */
  private refreshToken: string | null = null
  /**
   * Time in milliseconds since epoch when the token expires.
   */
  private tokenExpirationTime: number | null = null
  /**
   * Base URL of the Frontegg API
   */
  private readonly baseUrl: string
  /**
   * Client id from the Administration page of the Frontegg portal
   */
  private readonly clientId: string
  /**
   * The URL used to redirect the user after the OAuth login.
   */
  private readonly redirectUri: string
  /**
   * The URL used to redirect the user after the OAuth logout.
   */
  private readonly logoutRedirectUri: string
  /**
   * Cached promises to allow only one request at a time.
   */
  private userDataPromise: Promise<FronteggUserData> | null = null

  constructor(config: {
    baseUrl: string
    clientId: string
    redirectUri: string
    logoutRedirectUri: string
    userData?: FronteggUserData
    refreshToken?: string
    tokenExpirationTime?: number
  }) {
    this.baseUrl = config.baseUrl
    this.clientId = config.clientId
    this.redirectUri = config.redirectUri
    this.logoutRedirectUri = config.logoutRedirectUri

    if (config.userData) {
      this.userData = config.userData
      this.accessToken = config.userData.accessToken
    }

    if (config.refreshToken) this.refreshToken = config.refreshToken

    if (config.tokenExpirationTime) this.tokenExpirationTime = config.tokenExpirationTime
  }

  /**
   * Returns cached user data if it is already fetched.
   * Otherwise, it tries to fetch fresh user data from Frontegg.
   * In case the token is expired, the function throws an error.
   *
   * If there is a request is in progress, it returns the ongoing promise.
   */
  public async getUserData({ forceRefresh = false } = {}): Promise<FronteggUserData> {
    if (this.userData && !isTokenExpired(this.tokenExpirationTime) && !forceRefresh) {
      return this.userData
    }

    if (!this.userDataPromise) {
      this.userDataPromise = this.getAccessToken({ forceRefresh })
        .then((accessToken) => {
          return this.fetchUserData(accessToken)
        })
        .then((userData) => {
          this.userData = userData
          this.userDataPromise = null
          return this.userData
        })
        .catch((error: unknown) => {
          this.userDataPromise = null
          throw error
        })
    }

    return this.userDataPromise
  }

  /**
   * Function to get the Frontegg user access token.
   * If the access token is already cached and not expired, it returns the cached token.
   * If the access token is expired and a refresh token is available, it refreshes the access token and returns it.
   * If the access token is not cached, it tries to fetch it from the cookie set by the Frontegg hosted login page.
   *
   * @returns a Frontegg user access token if the user is authenticated, otherwise throws an error.
   */
  private async getAccessToken({ forceRefresh = false } = {}): Promise<string> {
    if (!this.accessToken) {
      return await this.fetchAccessTokenByCookie()
    }

    if (this.refreshToken && (forceRefresh || isTokenExpired(this.tokenExpirationTime))) {
      return await this.fetchAccessTokenByOAuthRefreshToken(this.refreshToken)
    }

    return this.accessToken
  }

  /**
   * Function to get the Frontegg user access token from the cookie set by the Frontegg hosted login page.
   *
   * @returns a Frontegg user access token if the user is authenticated, otherwise throws an error.
   */
  private async fetchAccessTokenByCookie() {
    const response = await fetchWithAssert(`${this.baseUrl}/frontegg/oauth/authorize/silent`, {
      method: 'POST',
      credentials: 'include',
      // CORS is required as the Frontegg URL is on a different subdomain from the application
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
    })

    const json: unknown = await response.json()
    try {
      const data = GET_FRONTEGG_TOKEN_RESPONSE_SCHEMA.parse(json)

      this.accessToken = data.access_token
      this.refreshToken = data.refresh_token
      this.tokenExpirationTime = calculateTokenExpirationTime(data.expires_in)
      return this.accessToken
    } catch (error: unknown) {
      const includeResponseBody = !['access_token', 'id_token', 'refresh_token'].some((key) =>
        JSON.stringify(json).includes(key),
      )

      throw new FronteggError({
        text: 'Error while parsing Frontegg response.',
        status: 500,
        url: `${this.baseUrl}/frontegg/oauth/authorize/silent`,
        fronteggTraceId: response.headers.get('frontegg-trace-id') ?? 'undefined',
        body: {
          response: includeResponseBody ? json : 'Response body contains sensitive information.',
          error,
        },
      })
    }
  }

  /**
   * Function to exchange the OAuth code for a Frontegg user access token
   *
   * @returns a Frontegg user access token if the user is authenticated, otherwise throw an 401 FronteggError.
   */
  public async fetchAccessTokenByOAuthCode(oauthCode: string) {
    const response = await fetchWithAssert(`${this.baseUrl}/frontegg/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: oauthCode,
        redirect_uri: this.redirectUri,
        code_verifier: await getCodeVerifier(),
        grant_type: 'authorization_code',
      }),
    })

    const json: unknown = await response.json()
    const data = GET_FRONTEGG_TOKEN_RESPONSE_SCHEMA.parse(json)
    this.accessToken = data.access_token
    this.refreshToken = data.refresh_token
    this.tokenExpirationTime = calculateTokenExpirationTime(data.expires_in)
    return this.accessToken
  }

  /**
   * Function to exchange the refresh token for a Frontegg user access token
   *
   * @returns a Frontegg user access token if the user is authenticated, otherwise throw an 401 FronteggError.
   */
  public async fetchAccessTokenByOAuthRefreshToken(refreshToken: string) {
    const response = await fetchWithAssert(`${this.baseUrl}/frontegg/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const json: unknown = await response.json()
    const data = GET_FRONTEGG_TOKEN_RESPONSE_SCHEMA.parse(json)
    this.accessToken = data.access_token
    this.refreshToken = data.refresh_token
    this.tokenExpirationTime = calculateTokenExpirationTime(data.expires_in)
    return this.accessToken
  }

  /**
   * Function to generate a valid Frontegg OAuth login URL
   * Stores the code verifier variable in the local storage to be used when exchanging the OAuth code for a user access token
   *
   * @returns a Frontegg OAuth login URL to redirect the user to
   * @see https://docs.frontegg.com/docs/native-hosted-login#step-2-request-auth-code
   */
  public async getOAuthLoginUrl() {
    const codeVerifier = await getCodeVerifier()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
    const hashedVerifier = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    const nonce = createRandomString()

    const loginUrl = new URL(`${this.baseUrl}/frontegg/oauth/authorize`)
    loginUrl.searchParams.set('client_id', this.clientId)
    loginUrl.searchParams.set('redirect_uri', this.redirectUri)
    loginUrl.searchParams.set('response_type', 'code')
    loginUrl.searchParams.set('scope', 'openid profile email')
    loginUrl.searchParams.set('code_challenge', hashedVerifier)
    loginUrl.searchParams.set('code_challenge_method', 'S256')
    loginUrl.searchParams.set('nonce', nonce)

    return loginUrl
  }

  /**
   * Returns URL for the Frontegg logout page.
   * After the user is logged out, the function redirects the user to the provided URL.
   */
  public getOAuthLogoutUrl() {
    const url = new URL(`${this.baseUrl}/frontegg/oauth/logout`)
    url.searchParams.set('post_logout_redirect_uri', this.logoutRedirectUri)
    return url.toString()
  }

  /**
   * Function to fetch the user details from Frontegg.
   * If the user is not authenticated or the access token is expired, the function throws error.
   * More information: https://docs.frontegg.com/reference/userscontrollerv2_getuserprofile
   */
  private async fetchUserData(userAccessToken: string): Promise<FronteggUserData> {
    const response = await fetchWithAssert(
      `${this.baseUrl}/frontegg/identity/resources/users/v2/me`,
      {
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
      },
    )

    const data = GET_FRONTEGG_USER_DATA_RESPONSE_SCHEMA.parse(await response.json())

    return {
      externalUserId: data.id,
      accessToken: userAccessToken,
      email: data.email,
      name: data.name,
      profilePictureUrl: data.profilePictureUrl,
      externalWorkspaceId: data.tenantId,
    }
  }
}
