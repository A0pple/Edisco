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


## General Information

*   **Contributors**: @appledev7000 (Programming), @ofekmoyal (Backend)
*   **Development**: Google Antigravity (Gemini 3 Pro)
*   **Backend**: Python, FastAPI, httpx (Async)
*   **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript
*   **Data Source**: Wikimedia EventStreams (SSE) & MediaWiki API
*   **Online Testing (1.0.0-alpha)**: https://edisco.themoyals.club/

## Updates
### 1.0.2-alpha (13/12/25)
*   **User Search**: An option to see the edits and general information of a specific Wikipedia account.
*   **GUI "Diffedits"**: A GUI pop-up screen that lets you see the specific difference of an edit in the live feed.
*   **Latest Edit**: An option to see who have done the last edit in Dispute & Activity area and how long ago it was commented.
*   **Wikidata Caption**: Wikidata captaion in corresponding articles in the "Top Viewed" section.
*   **Refresh Button**: A refresh button to see the new latest information on the panel.
*   **Active Paragraph**: Showing the most actively edited paragraph at the "Activity Area".
#### Fixes
*   Live Feed - number of edits fix
