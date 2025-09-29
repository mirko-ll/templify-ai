# TemplAIto Setup Guide

## Prerequisites

- Node.js 18+ installed
- MySQL database server
- Google Cloud Console project for OAuth

## Environment Setup

1. **Copy the environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Configure your `.env` file:**

### Database Configuration
```env
DATABASE_URL="mysql://username:password@localhost:3306/templify_ai"
```
Replace `username`, `password`, and database connection details with your MySQL credentials.

### NextAuth.js Configuration
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-nextauth-key-here"
```
Generate a secret key:
```bash
openssl rand -base64 32
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client IDs
5. Configure OAuth consent screen
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Client Secret to your `.env`:

```env
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### AI API Keys (Already configured)
```env
OPENAI_API_KEY="your-openai-api-key"
CLOUD_API_KEY="your-anthropic-api-key"
```

## Database Setup

1. **Create MySQL database:**
   ```sql
   CREATE DATABASE templify_ai;
   ```

2. **Generate Prisma client:**
   ```bash
   npm run db:generate
   ```

3. **Push database schema:**
   ```bash
   npm run db:push
   ```

   Or use migrations:
   ```bash
   npm run db:migrate
   ```

4. **Optional: Open Prisma Studio to view database:**
   ```bash
   npm run db:studio
   ```

## Installation & Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Visit your application:**
   Open [http://localhost:3000](http://localhost:3000)

## Database Schema

The application includes the following models:
- **User**: Google OAuth user information
- **Account**: OAuth account linking
- **Session**: User sessions
- **Profile**: Extended user profile with personal and company details
- **VerificationToken**: Email verification tokens

## Features Added

✅ **Authentication System**
- Google OAuth integration
- Secure session management
- Protected routes middleware

✅ **Modern UI Components**
- Eye-catching login page with glassmorphism design
- Header with user dropdown menu
- Profile settings page with personal and company information

✅ **Database Integration**
- Prisma ORM with MySQL
- User profiles with extended information
- Secure data handling

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

## Troubleshooting

### Database Connection Issues
- Ensure MySQL server is running
- Verify database credentials in `.env`
- Check if database `templify_ai` exists

### OAuth Issues
- Verify Google OAuth credentials
- Check authorized redirect URIs in Google Console
- Ensure NEXTAUTH_URL matches your domain

### Build Issues
- Run `npm run db:generate` before building
- Clear `.next` folder and rebuild if needed

## Security Notes

🔒 **Important Security Reminders:**
- Never commit `.env` file to version control
- Use strong, unique NEXTAUTH_SECRET
- Regularly rotate API keys
- Configure proper CORS settings for production
### templaito-backend Service

1. Copy `.env.example` inside `templaito-backend/` to `.env` and set:
   - `PORT` (defaults to `4000`)
   - `SERVICE_TOKEN` (must match `TEMPLAITO_SERVICE_TOKEN` in the Next.js app)
   - `SQUALO_API_URL` (base URL of your SqualoMail API proxy)
2. Install dependencies and start the service:
   ```bash
   cd templaito-backend
   npm install
   npm run dev
   ```
3. In the main `templaito/.env`, set:
   ```
   TEMPLAITO_BACKEND_URL=http://localhost:4000
   TEMPLAITO_SERVICE_TOKEN=the-same-token-you-set-in-backend
   ENCRYPTION_KEY=<32-char-secret>
   ```
4. Restart the Next.js dev server so the client integration picks up the new environment variables.

