# GiaHUB Backend - Python/FastAPI

This is the Python FastAPI conversion of the Node.js backend for the GiaHUB healthcare consultation platform.

## Features

- **FastAPI** framework for high-performance API
- **WebSocket** support using FastAPI WebSockets (converted from ws library)
- **MongoDB** integration with Motor (async MongoDB driver)
- **JWT Authentication** with role-based access control
- **File uploads** using GridFS for MongoDB
- **Email service** with SMTP support
- **Google OAuth** integration (using Authlib)
- **Stripe payments** integration
- **Input validation** using Pydantic models

## Project Structure

```
backend_python/
├── main.py                 # FastAPI application entry point
├── requirements.txt        # Python dependencies
├── dev.py                 # Development server script
├── dev.bat                # Windows development script
├── .env.example           # Environment variables template
└── src/
    ├── db.py              # MongoDB connection and utilities
    ├── config/
    │   └── oauth.py       # Google OAuth configuration
    ├── routes/
    │   ├── auth.py        # Authentication routes
    │   ├── users.py       # User management routes
    │   ├── profile.py     # User profile routes
    │   ├── payments.py    # Stripe payment routes
   │   └── uploads.py     # File upload routes
    ├── services/
   │   └── email_service.py     # Email sending service
    ├── utils/
    │   └── auth.py        # Authentication utilities
    └── ws/
        └── matchmaking.py # WebSocket matchmaking
```

## Quick Start

### Prerequisites

- Python 3.8+
- MongoDB instance running (default: localhost:8801)
- Optional: Virtual environment

### Development Setup

1. **Clone and navigate to the Python backend:**
   ```bash
   cd backend_python
   ```

2. **Copy environment variables:**
   ```bash
   copy .env.example .env
   ```

3. **Edit `.env` file with your configuration:**
   - MongoDB connection string
   - Google OAuth credentials
   - SMTP settings
   - Stripe API keys

4. **Run development server:**

   **Windows:**
   ```cmd
   dev.bat
   ```

   **Unix/Linux/macOS:**
   ```bash
   python dev.py
   ```

   **Manual setup:**
   ```bash
   # Create virtual environment
   python -m venv venv
   
   # Activate virtual environment
   # Windows:
   venv\Scripts\activate
   # Unix/Linux/macOS:
   source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Run development server
   uvicorn main:app --reload --host 0.0.0.0 --port 4000
   ```

5. **API will be available at:**
   - REST API: http://localhost:4000
   - Interactive docs: http://localhost:4000/docs
   - WebSocket: ws://localhost:4000/ws

## Key Differences from Node.js Version

### Framework Changes
- **Express.js → FastAPI**: Modern Python async framework
- **ws → FastAPI WebSockets**: Native WebSocket support
- **express-session → JWT**: Stateless authentication
- **passport → Authlib**: OAuth integration

### Database
- **MongoDB driver → Motor**: Async MongoDB driver for Python
- **GridFS**: File storage (same as Node.js version)
- **Async/await**: Native Python async support

### Authentication
- **JWT tokens**: Stateless authentication
- **Pydantic models**: Request/response validation
- **FastAPI dependencies**: Middleware replacement

### File Structure
- **Pydantic models**: Type-safe request/response schemas
- **FastAPI routing**: Declarative route definitions
- **Python async/await**: Native async programming

## API Routes

All routes from the original Node.js backend have been converted:

- `POST /auth/login` - User authentication
- `GET /auth/me` - Current user info
- `POST /users/users` - User registration
- `POST /users/providers` - Provider registration
- `GET /users/providers` - List providers
- `GET /profile/profile` - Get user profile
- `PUT /profile/profile` - Update user profile
- `POST /payments/checkout-session` - Create payment session
- `POST /uploads/upload` - File upload
- `GET /uploads/files` - List user files
  

## WebSocket API

WebSocket endpoint: `/ws?token=<jwt_token>`

**Message Types:**
- `ping` - Heartbeat (responds with `pong`)
- `consult_request` - Broadcast consultation request

## Environment Variables

See `.env.example` for all available configuration options:

- `PORT` - Server port (default: 4000)
- `MONGO_URL` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `SMTP_*` - Email configuration
- `STRIPE_SECRET_KEY` - Stripe API key

## Development

### Adding New Routes

1. Create route file in `src/routes/`
2. Add router to `main.py`
3. Define Pydantic models for validation

### Database Operations

Use `get_collections()` to access MongoDB collections:

```python
from src.db import get_collections

collections = get_collections()
user = await collections['users'].find_one({"id": user_id})
```

### WebSocket Extensions

Extend `src/ws/matchmaking.py` to add new WebSocket functionality.

## Production Deployment

1. Set production environment variables
2. Use a production WSGI server like Gunicorn:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
   ```

## Migration from Node.js

This Python backend maintains API compatibility with the original Node.js version. The frontend should work without changes when switching backends.

### Key Compatibility Features

- Same REST API endpoints
- Same WebSocket message format
- Same database schema
- Same authentication flow
- Same file upload/download mechanism
