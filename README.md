# Edisco - Wikipedia Live Monitor

Edisco is a real-time monitoring dashboard for Hebrew Wikipedia, designed to track edits, new articles, and trending discussions as they happen.

## Features

*   **Live Feed**: Real-time stream of all edits on Hebrew Wikipedia.
*   **Activity Areas**: Top edited articles and most active editors (24h / 7d).
*   **Dispute Areas**: Top talk pages ranked by unique participants (24h / 7d).
*   **New Articles**: Live list of newly created articles.
*   **Top Viewed**: Most viewed articles (24h / 7d).
*   **Anonymous Filter**: Global toggle to show only anonymous (IP) edits across the entire dashboard.
*   **Global Time Control**: Switch all columns between "24 Hours" and "7 Days" with a single click.

## Tech Stack

*   **Contributors**: @appledev7000 (Programming), @ofekmoyal (Backend)
*   **Development**: Google Antigravity (Gemini 3 Pro)
*   **Backend**: Python, FastAPI, httpx (Async)
*   **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript
*   **Data Source**: Wikimedia EventStreams (SSE) & MediaWiki API

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/edisco.git
    cd edisco
    ```

2.  Create a virtual environment:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4.  Run the application:
    ```bash
    uvicorn main:app --host 0.0.0.0 --port 8000
    ```

5.  Open your browser at `http://localhost:8000`.
