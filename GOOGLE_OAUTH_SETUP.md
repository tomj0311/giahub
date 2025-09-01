# Google OAuth Setup Guide

This application now supports Google OAuth for user authentication and registration. Follow these steps to set up Google OAuth:

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API (or Google Identity API)

## 2. Configure OAuth Consent Screen

1. In the Google Cloud Console, navigate to "APIs & Services" > "OAuth consent screen"
2. Choose "External" for user type (unless you're creating an internal app)
3. Fill in the required information:
   - App name: "ConsultFlow Platform"
   - User support email: your email
   - Developer contact information: your email
4. Add scopes:
   - `../auth/userinfo.email`
   - `../auth/userinfo.profile`
5. Add test users if needed

## 3. Create OAuth 2.0 Credentials

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application" as the application type
4. Configure:
   - Name: "ConsultFlow Platform Web Client"
   - Authorized JavaScript origins: 
     - `http://localhost:4000` (for development)
     - Your production backend URL
   - Authorized redirect URIs:
     - `http://localhost:4000/auth/google/callback` (for development)
     - Your production backend URL + `/auth/google/callback`

## 4. Configure Environment Variables

Copy the client ID and client secret from the Google Cloud Console and add them to your `.env` file:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
SESSION_SECRET=your_session_secret_here
```

## 5. Update Frontend Configuration

Make sure your frontend environment variables are set correctly:

```bash
# In your frontend .env file
VITE_API_URL=http://localhost:4000
```

## 6. Testing

1. Start your backend server: `npm run dev`
2. Start your frontend server: `npm run dev`
3. Navigate to the login page
4. Click "Sign in with Google"
5. Complete the OAuth flow

## Features

The Google OAuth integration provides:

- **Automatic registration**: New users are automatically registered as users
- **Profile completion**: Users can complete their profile after OAuth registration
- **Email verification bypass**: Google-verified emails don't need additional verification
- **Seamless login**: Existing users can sign in with Google if they used the same email

## Security Notes

- Users authenticated via Google get a secure random password generated for their account
- The `googleId` field is stored for future OAuth authentications
- Sessions are secure and use the `SESSION_SECRET` environment variable
- JWT tokens are still generated for API authentication

## Troubleshooting

**"Invalid OAuth client" error:**
- Check that your redirect URI exactly matches what's configured in Google Cloud Console
- Ensure your Google Client ID is correct

**"Access blocked" error:**
- Make sure you've added your email as a test user in the OAuth consent screen
- Verify that the required scopes are configured

**"Sign-in failed" error:**
- Check your backend logs for detailed error messages
- Verify that your Google Client Secret is correct
- Ensure your backend can reach Google's OAuth servers
