# Edisco - Wikipedia Live Monitor
Edisco is a real-time monitoring dashboard for Hebrew Wikipedia, designed to track edits, new articles, and trending discussions as they happen.

## Quick Start

### Option 1: Docker (Recommended)

Pull and run the Docker image from Docker Hub:

```bash
sudo docker run -p 80:8000 ofekmoyal/edisco:latest
```

Or use docker-compose:

```bash
sudo docker-compose up -d
```

Access the app at **http://localhost**

**Why `sudo`?** Port 80 is a privileged port on Linux/Mac. The application runs on port 8000 internally, but Docker maps it to port 80 on your host machine for easy access.

### Option 2: Local Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the application:
```bash
python main.py
```

Access the app at **http://localhost:8000**

## How to Run

### Using Docker (Standard)

The standard way to run this application is with Docker:

```bash
# Pull the latest image from Docker Hub
docker pull ofekmoyal/edisco:latest

# Run the container (requires sudo for port 80)
sudo docker run -p 80:8000 ofekmoyal/edisco:latest
```

**Port Mapping Explanation:**
- `80:8000` means: Map port 80 (your localhost) → port 8000 (inside container)
- The application runs on port 8000 internally
- You access it at `http://localhost` (which is port 80)

### Using docker-compose

For easier management and persistence:

```bash
# Start the application
sudo docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
sudo docker-compose down
```

### Local Python Execution

If you prefer to run without Docker:

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
python main.py

# Access at http://localhost:8000
```

### Verify the App is Running

```bash
# Check via curl
curl http://localhost

# Or open in browser
open http://localhost
```

## Docker Support

This project includes full Docker support for easy deployment:

- **Dockerfile**: Containerized Python 3.11-slim application
- **docker-compose.yml**: Pre-configured for local development
- **Healthchecks**: Automatic container health monitoring
- **Port Mapping**: Runs on port 8000 internally, exposed as port 80

For detailed Docker instructions, see [DOCKER_INSTRUCTIONS.md](DOCKER_INSTRUCTIONS.md)

## Requirements
Python dependencies listed in requirements.txt

## Features
*   **Live Feed**: Real-time stream of all edits on Hebrew Wikipedia.
*   **Activity Areas**: Top edited articles and most active editors (24h / 7d).
*   **Dispute Areas**: Top talk pages ranked by unique participants (24h / 7d).
*   **New Articles**: Live list of newly created articles.
*   **Top Viewed**: Most viewed articles (24h / 7d).
*   **Anonymous Filter**: Global toggle to show only anonymous (IP) edits across the entire dashboard.
*   **Global Time Control**: Switch all columns between "24 Hours" and "7 Days" with a single click.

## Tech Stack
*   **Backend**: Python, FastAPI, httpx (Async)
*   **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript
*   **Data Source**: Wikimedia EventStreams (SSE) & MediaWiki API

## Deployment

### Docker Hub
The application is available on Docker Hub at: `ofekmoyal/edisco`

Pull the latest image:
```bash
docker pull ofekmoyal/edisco:latest
```

### Build Locally
To build your own Docker image:
```bash
docker build -t ofekmoyal/edisco:latest .
```

## File Structure

```
Edisco/
├── main.py                  # FastAPI application
├── wiki_client.py           # Wikipedia/Wikimedia API client
├── requirements.txt         # Python dependencies
├── Dockerfile              # Container configuration
├── docker-compose.yml      # Docker Compose setup
├── DOCKER_INSTRUCTIONS.md  # Detailed Docker guide
├── README.md              # This file
├── static/                # Frontend assets
│   ├── index.html
│   ├── style.css
│   └── app.js
└── verify_client.py       # Verification script
```

## Credits
*   **Development**: Google Antigravity (Gemini 3 Pro)
*   **Language**: Python
*   **Containerization**: Docker & Docker Compose
