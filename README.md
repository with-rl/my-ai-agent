# My AI Agent

A conversational AI agent application powered by Google Gemini, featuring a React frontend and FastAPI + LangGraph backend with session-based memory persistence.

## Features

- 🤖 Conversational AI powered by Google Gemini 2.5 Flash
- 💾 Session-based conversation history and continuity
- 🔄 Real-time streaming responses (Server-Sent Events)
- 🌓 Dark/Light theme support
- 🐳 Easy deployment with Docker Compose

## Quick Start

### Run with Docker (Recommended)

```bash
# Build and run the full application
docker-compose up --build

# Access URLs:
# Frontend: http://localhost:8888
# Backend API: http://localhost:8887
```

### Local Development Environment

#### Backend Setup

```bash
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Set up environment variables (see Environment Setup section below)
cp .env_sample .env
# Edit .env file with your API keys

# Start development server from project root
cd ..
python backend/src/main.py
```

Backend runs at http://localhost:8887

#### Frontend Setup

```bash
# Install Node.js dependencies (run from project root)
npm install --prefix frontend

# Start development server (run from project root)
npm start --prefix frontend
```

Frontend runs at http://localhost:3000

### LangGraph Development Mode

```bash
# Use LangGraph CLI development mode
langgraph dev --config backend/langgraph.json
```

## Architecture

### Backend (FastAPI + LangGraph)
- **FastAPI**: RESTful API server with streaming endpoints
- **LangGraph**: Conversation workflow management and state tracking
- **Google Gemini**: Conversational AI model
- **MemorySaver**: Session-based conversation history storage

### Frontend (React)
- **React**: User interface
- **Axios**: API communication and error handling
- **Server-Sent Events**: Real-time streaming responses
- **Local Storage**: Theme settings persistence

### Key Components
```
backend/
├── src/
│   ├── main.py      # FastAPI application
│   └── graph.py     # LangGraph workflow
└── langgraph.json   # LangGraph configuration

frontend/
├── src/
│   ├── components/ChatBot.js    # Chat interface
│   └── services/api.js          # API client
└── package.json
```

## API Endpoints

### Chat
- `POST /chat` - Send chat message
- `POST /chat/stream` - Streaming chat response

### Health Check
- `GET /health` - Detailed server status
- `GET /` - Basic server information

## Environment Setup

### Backend Environment Configuration

1. Copy the sample environment file:
   ```bash
   cp backend/.env_sample backend/.env
   ```

2. Edit the `backend/.env` file and set the following required environment variables:

   ```env
   # Required: Google AI API Configuration
   GOOGLE_API_KEY=your_google_api_key_here
   GOOGLE_CLOUD_PROJECT_ID=your_project_id
      
   # Optional: Database Configuration
   DATABASE_URI=sqlite:///checkpoint.sqlite
   ```

### API Keys Setup

- **Google API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Development

### Running Tests

```bash
# Frontend tests
npm test --prefix frontend

# Backend health check
curl http://localhost:8887/health
```

### View Logs

```bash
# Docker logs
docker-compose logs -f

# Service-specific logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Tech Stack

### Backend
- Python 3.12+
- FastAPI
- LangGraph
- LangChain
- Google Gemini API
- Uvicorn

### Frontend  
- React 18
- Axios
- Marked (Markdown rendering)
- DOMPurify (XSS protection)

### Deployment
- Docker & Docker Compose
- Nginx (Frontend serving)

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full license text.