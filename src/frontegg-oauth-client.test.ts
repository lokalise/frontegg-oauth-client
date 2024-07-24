import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import {
  FronteggOAuthClient,
  type GetFronteggTokenResponse,
  type GetFronteggUserDataResponse,
} from './frontegg-oauth-client'

const EmptyResponse = (code: number) => new HttpResponse(null, { status: code })

const baseUrl = 'http://frontegg-test-instance.local'
const clientConfig = {
  baseUrl,
  clientId: 'test-client-id',
  redirectUri: 'http://localhost:3000/oauth/callback',
  logoutRedirectUri: 'http://localhost:3000',
}

const FRONTEGG_RESPONSE = {
  token_type: 'Bearer',
  access_token: 'test-access-token',
  id_token: 'test-id-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
} satisfies GetFronteggTokenResponse

const FRONTEGG_USER_DATA = {
  id: 'test-user-id',
  email: 'test@lokalise.com',
  name: 'dummy username',
  profilePictureUrl: 'https://www.gravatar.com/avatar/00000000000000000000000000000000',
  tenantId: 'test-tenant-id',
} satisfies GetFronteggUserDataResponse

const USER_DATA = {
  externalUserId: FRONTEGG_USER_DATA.id,
  accessToken: FRONTEGG_RESPONSE.access_token,
  email: FRONTEGG_USER_DATA.email,
  name: FRONTEGG_USER_DATA.name,
  profilePictureUrl: FRONTEGG_USER_DATA.profilePictureUrl,
  externalWorkspaceId: FRONTEGG_USER_DATA.tenantId,
}

const server = setupServer()
server.listen()

describe('frontegg-oauth-client', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  describe('userData', () => {
    it('throws an error when unable to fetch user data', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () => HttpResponse.error()),
      )
      const client = new FronteggOAuthClient(clientConfig)
      await expect(() => client.getUserData()).rejects.toThrowError('Failed to fetch')
    })

    it('returns user data based on auth token', async () => {
      server.use(
        // This is a request that is made to the Frontegg API when the cookie is available
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () =>
          HttpResponse.json(FRONTEGG_RESPONSE),
        ),
        http.get(`${baseUrl}/frontegg/identity/resources/users/v2/me`, () =>
          HttpResponse.json(FRONTEGG_USER_DATA),
        ),
      )

      const client = new FronteggOAuthClient(clientConfig)
      const userData = await client.getUserData()
      expect(userData).toEqual(USER_DATA)
      expect(client.userData).toEqual(USER_DATA)
    })

    it('allows to fetch user data only once at a time', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () =>
          HttpResponse.json(FRONTEGG_RESPONSE),
        ),
        http.get(`${baseUrl}/frontegg/identity/resources/users/v2/me`, () =>
          HttpResponse.json(FRONTEGG_USER_DATA),
        ),
      )

      const client = new FronteggOAuthClient(clientConfig)

      const userDataPromise1 = client.getUserData()
      const userDataPromise2 = client.getUserData()

      // Check if both calls return the same promise
      expect(userDataPromise1).toStrictEqual(userDataPromise2)

      const userData = await userDataPromise1
      const userData2 = await userDataPromise2

      expect(userData).toEqual(USER_DATA)
      expect(userData2).toEqual(USER_DATA)
    })

    it('returns user data based on refresh token', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () =>
          HttpResponse.json({ ...FRONTEGG_RESPONSE, expires_in: 0 }),
        ),
        http.get(`${baseUrl}/frontegg/identity/resources/users/v2/me`, () =>
          HttpResponse.json(FRONTEGG_USER_DATA),
        ),
        http.post(`${baseUrl}/frontegg/oauth/token`, () =>
          HttpResponse.json({
            ...FRONTEGG_RESPONSE,
            access_token: 'test-refreshed-access-token',
          }),
        ),
      )

      const client = new FronteggOAuthClient(clientConfig)

      const userData = await client.getUserData()

      expect(userData).toEqual(USER_DATA)
      expect(client.userData).toEqual(USER_DATA)

      const userDataRefreshed = await client.getUserData()

      const expectedUserDataRefreshed = {
        ...USER_DATA,
        accessToken: 'test-refreshed-access-token',
      }

      expect(userDataRefreshed).toEqual(expectedUserDataRefreshed)
      expect(client.userData).toEqual(expectedUserDataRefreshed)
    })
  })

  describe('fetchAccessTokenByOAuthCode', () => {
    it('throws an error when unable to fetch access token by OAuth code', async () => {
      server.use(http.post(`${baseUrl}/frontegg/oauth/token`, () => HttpResponse.error()))
      const client = new FronteggOAuthClient(clientConfig)
      await expect(() =>
        client.fetchAccessTokenByOAuthCode('test-oauth-code'),
      ).rejects.toThrowError('Failed to fetch')
    })

    it('throws an error when api returns 401', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/token`, () =>
          // Frontegg returns null and status 401 when the user is not authenticated
          EmptyResponse(401),
        ),
      )

      const client = new FronteggOAuthClient(clientConfig)
      await expect(() =>
        client.fetchAccessTokenByOAuthCode('test-oauth-code'),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[FronteggError: {"text":"Error while fetching Frontegg endpoint.","status":401,"url":"http://frontegg-test-instance.local/frontegg/oauth/token","fronteggTraceId":"undefined","body":"Error while fetching Frontegg endpoint."}]`,
      )
    })

    it('returns access token based on OAuth code', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/token`, () => HttpResponse.json(FRONTEGG_RESPONSE)),
      )

      const client = new FronteggOAuthClient(clientConfig)
      const accessToken = await client.fetchAccessTokenByOAuthCode('test-oauth-code')

      expect(accessToken).toBe('test-access-token')
    })
  })

  describe('fetchAccessTokenByOAuthRefreshToken', () => {
    it('throws an error when unable to fetch access token by refresh token', async () => {
      server.use(http.post(`${baseUrl}/frontegg/oauth/token`, () => HttpResponse.error()))
      const client = new FronteggOAuthClient(clientConfig)
      await expect(() =>
        client.fetchAccessTokenByOAuthRefreshToken('test-oauth-code'),
      ).rejects.toThrowError('Failed to fetch')
    })

    it('throws an error when api returns 401', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/token`, () =>
          // Frontegg returns null and status 401 when the user is not authenticated
          EmptyResponse(401),
        ),
      )

      const client = new FronteggOAuthClient(clientConfig)
      await expect(() =>
        client.fetchAccessTokenByOAuthRefreshToken('test-oauth-code'),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[FronteggError: {"text":"Error while fetching Frontegg endpoint.","status":401,"url":"http://frontegg-test-instance.local/frontegg/oauth/token","fronteggTraceId":"undefined","body":"Error while fetching Frontegg endpoint."}]`,
      )
    })

    it('returns access token based on refresh token', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/token`, () => HttpResponse.json(FRONTEGG_RESPONSE)),
      )

      const client = new FronteggOAuthClient(clientConfig)
      const accessToken = await client.fetchAccessTokenByOAuthRefreshToken('test-oauth-code')

      expect(accessToken).toBe('test-access-token')
    })
  })

  describe('getOAuthLoginUrl', () => {
    it('returns the OAuth login URL', async () => {
      const client = new FronteggOAuthClient(clientConfig)
      const loginUrl = await client.getOAuthLoginUrl()

      expect(loginUrl.origin).toBe(baseUrl)
      expect(loginUrl.searchParams.get('client_id')).toBe(clientConfig.clientId)
      expect(loginUrl.searchParams.get('redirect_uri')).toBe(clientConfig.redirectUri)
      expect(loginUrl.searchParams.get('scope')).toBe('openid profile email')
    })
  })

  describe('getLogoutUrl', () => {
    it('returns the logout URL', () => {
      const client = new FronteggOAuthClient(clientConfig)
      const loginUrl = client.getOAuthLogoutUrl()

      expect(loginUrl.toString()).toBe(
        'http://frontegg-test-instance.local/frontegg/oauth/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000',
      )
    })
  })
})
