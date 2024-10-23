import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import {
  type FronteggDecodedToken,
  FronteggOAuthClient,
  type GetFronteggTokenResponse,
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
  access_token:
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAbG9rYWxpc2UuY29tIiwibmFtZSI6ImR1bW15IHVzZXJuYW1lIiwicHJvZmlsZVBpY3R1cmVVcmwiOiJodHRwczovL3d3dy5ncmF2YXRhci5jb20vYXZhdGFyLzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwidGVuYW50SWQiOiJ0ZXN0LXRlbmFudC1pZCJ9.dxFESK7KleQdEz4hBmd-pKMSKUN0uYJ44ycd-SQeAYBGfJcQQPCsjOWBDSlxGUodLmalhMMVDTvmN4G4La5lfOakas4kJzrfVAXfV_-ZYAiOHZaqS_OTMZaTPAcjWZfnNNEnewuNhZSiuzqEbaIpKOX4tmZOHH1ganJT2Z-gvRiArVC1zEZdZPFt0MVGl9Tt3Kmcgvf3j22j1FWI5AqVsiYFHolISaWveZyIR62qtF3pyGLRW-4qwoujV393Kf52kNWez0P7Ed70-yrVJX_D0buJ1aW-bPXSh1F0ifnGBvYKtoUqSLZ1e0InA3rTccWt5DIyOUULaE0asgJxB61Nqg',
  id_token: 'test-id-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
} satisfies GetFronteggTokenResponse

const FRONTEGG_IMPERSONATED_RESPONSE = {
  ...FRONTEGG_RESPONSE,
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAbG9rYWxpc2UuY29tIiwibmFtZSI6ImR1bW15IHVzZXJuYW1lIiwicHJvZmlsZVBpY3R1cmVVcmwiOiJodHRwczovL3d3dy5ncmF2YXRhci5jb20vYXZhdGFyLzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwidGVuYW50SWQiOiJ0ZXN0LXRlbmFudC1pZCIsImFjdCI6eyJzdWIiOiJ0ZXN0LWFkbWluLXVzZXIiLCJ0eXBlIjoiaW1wZXJzb25hdGlvbiJ9fQ.lamGCm4sfTCsfyZ11-rnecqqJcAKua2IiCMQxHr5kQw',
}

const FRONTEGG_USER_DATA = {
  sub: 'test-user-id',
  email: 'test@lokalise.com',
  name: 'dummy username',
  profilePictureUrl: 'https://www.gravatar.com/avatar/00000000000000000000000000000000',
  tenantId: 'test-tenant-id',
} satisfies FronteggDecodedToken

const USER_DATA = {
  externalUserId: FRONTEGG_USER_DATA.sub,
  accessToken: FRONTEGG_RESPONSE.access_token,
  email: FRONTEGG_USER_DATA.email,
  name: FRONTEGG_USER_DATA.name,
  profilePictureUrl: FRONTEGG_USER_DATA.profilePictureUrl,
  externalWorkspaceId: FRONTEGG_USER_DATA.tenantId,
  isImpersonated: false,
}

const IMPERSONATED_USER_DATA = {
  ...USER_DATA,
  accessToken: FRONTEGG_IMPERSONATED_RESPONSE.access_token,
  isImpersonated: true,
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
      )

      const client = new FronteggOAuthClient(clientConfig)
      const userData = await client.getUserData()
      expect(userData).toEqual(USER_DATA)
      expect(client.userData).toEqual(USER_DATA)
    })

    it('returns impersonated user data based on auth token', async () => {
      server.use(
        // This is a request that is made to the Frontegg API when the cookie is available
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () =>
          HttpResponse.json(FRONTEGG_IMPERSONATED_RESPONSE),
        ),
      )

      const client = new FronteggOAuthClient(clientConfig)
      const userData = await client.getUserData()
      expect(userData).toEqual(IMPERSONATED_USER_DATA)
      expect(client.userData).toEqual(IMPERSONATED_USER_DATA)
    })

    it('allows to fetch user data only once at a time', async () => {
      server.use(
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () =>
          HttpResponse.json(FRONTEGG_RESPONSE),
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
      const refreshedAccessToken =
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAbG9rYWxpc2UuY29tIiwibmFtZSI6ImR1bW15IHVzZXJuYW1lIiwicHJvZmlsZVBpY3R1cmVVcmwiOiJodHRwczovL3d3dy5ncmF2YXRhci5jb20vYXZhdGFyLzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwIiwidGVuYW50SWQiOiJ0ZXN0LXRlbmFudC1pZCIsInNpZCI6InJlZnJlc2hlZC1zZXNzaW9uIn0.sSSFmSvkO7Rns6dkZsIqRhXzGfWPYhg2_IfK9sksqCnEpoiiQ5hNRy43hoU_rlGLJDehaMfxv9RYJuNJbU-HKIKrHyfsQWztGLyK11fEuMb1f3U9hd3-8eljIjk_SSrL3OGbvYu612qKkkEdyZkmjnCTxmKRtc3g0BSJI-EIDIXBoBKwRYb7p6TMdD5vba7krMZ-AbVp0eDjiiL6u8XorQa4Y95pkOSytfJl7T8T3-yPMlUAYep6Q4-1Lvg26W43KCTlb5-qsddPrH2T_FNL6LkVXaWxHbLtNRENpCQR6elD5528NgnBEOSphKZeuPUG4WvMsrOX2B0-nxFlzXooqg'

      server.use(
        http.post(`${baseUrl}/frontegg/oauth/authorize/silent`, () =>
          HttpResponse.json({ ...FRONTEGG_RESPONSE, expires_in: 0 }),
        ),
        http.post(`${baseUrl}/frontegg/oauth/token`, () =>
          HttpResponse.json({
            ...FRONTEGG_RESPONSE,
            access_token: refreshedAccessToken,
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
        accessToken: refreshedAccessToken,
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

      expect(accessToken).toBe(FRONTEGG_RESPONSE.access_token)
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

      expect(accessToken).toBe(FRONTEGG_RESPONSE.access_token)
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
