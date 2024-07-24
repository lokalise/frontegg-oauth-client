# frontegg-oauth-client

Minimalistic Frontegg OAuth implementation for browser applications. It offers APIs for retrieving tokens and basic user data.

This package is an alternative to the official [Frontegg React SDK](https://github.com/frontegg/frontegg-react). 

## Installation

Use the package manager npm to install the library.

```bash
npm install @lokalise/frontegg-oauth-client
```

## Usage

The library offers several APIs to initiate the OAuth flow and retrieve user data.

```js
// Create client instance
const client = new FronteggOAuthClient({
    baseUrl: 'https://frontegg-custom-url.com',
    clientId: 'CLIENT_ID',
    redirectUri: `${window.location.origin}/oauth/callback`,
    logoutRedirectUri: window.location.origin,
})

try {
    // Retrieve user
    const user = await client.getUserData();

    // Retrieve token 
    const accessToken = user.accessToken;
} catch (error) {
    // In case we receive a 401 Unauthorized error, we need to redirect the user to the login page.
    if (error instanceof FronteggError && error.status === 401) {
        // Retrieve login URL
        const loginUrl = await client.getOAuthLoginUrl() 
        
        // Redirect to Frontegg login page
        window.location.href = loginUrl;
        return;
    }
    
    // Rethrow unknown error.
    throw error
}
```

You also need to setup OAuth callback path in your browser app.

```js
// OAuth callback app - usually /oauth/callback URL
const handleRequest = async (request: Request) => {
    const oauthCode = new URL(request.url).searchParams.get('code')

    if (!oauthCode) {
        throw new Error('Missing oauth code');
    }

    // After successful login, the client can retrieve 
    // the access token through the OAuth code.
    await client.fetchAccessTokenByOAuthCode(oauthCode)
    
    
    // Redirect the user to the main app
    window.location.href = '/';
}
```

## Credits

This library is brought to you by a joint effort of Lokalise engineers:

[Arthur Suermondt](https://github.com/arthuracs)
[Szymon Chudy](https://github.com/szymonchudy)
[Ondrej Sevcik](https://github.com/ondrejsevcik)


