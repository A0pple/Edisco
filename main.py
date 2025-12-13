from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from wiki_client import WikiClient
import asyncio
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Edisco")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize WikiClient
wiki_client = WikiClient()

@app.on_event("startup")
async def startup_event():
    pass

@app.on_event("shutdown")
async def shutdown_event():
    await wiki_client.close()

@app.get("/")
async def get():
    with open("static/index.html", "r") as f:
        return HTMLResponse(content=f.read())

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        async for edit in wiki_client.get_recent_edits_stream():
            await websocket.send_json(edit)
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

@app.get("/api/search")
async def search(q: str, period: str = "7d"):
    """
    Search for a word in recent edits.
    """
    if not q:
        return {"results": []}
    
    results = await wiki_client.search_edits(q, period=period)
    return {"results": results}

@app.get("/api/recent")
async def get_recent(limit: int = 50, period: str = None, anon_only: bool = False, user: str = None, title: str = None, sort: str = "date"):
    """
    Get recent edits.
    """
    results = await wiki_client.get_recent_edits(limit=limit, period=period, anon_only=anon_only, user=user, title=title, sort=sort)
    return {"results": results}

@app.get("/api/top-edited")
async def top_edited(limit: int = 25, period: str = "24h", anon_only: bool = False, user: str = None, title: str = None):
    """
    Get top edited articles.
    Args:
        limit (int): The maximum number of articles to return. Defaults to 25.
        period (str): The time period to consider (e.g., "24h", "7d"). Defaults to "24h".
    """
    results = await wiki_client.get_top_edited_articles(limit=limit, period=period, anon_only=anon_only, user=user, title=title)
    return {"results": results}

@app.get("/api/top-editors")
async def top_editors(limit: int = 25, period: str = "24h", anon_only: bool = False, user: str = None, title: str = None):
    """
    Get top editors.
    """
    results = await wiki_client.get_top_editors(limit=limit, period=period, anon_only=anon_only, user=user, title=title)
    return {"results": results}

@app.get("/api/top-talk-pages")
async def top_talk_pages(limit: int = 25, period: str = "24h", anon_only: bool = False, user: str = None, title: str = None):
    """
    Get top talk pages.
    """
    results = await wiki_client.get_top_talk_pages(limit=limit, period=period, anon_only=anon_only, user=user, title=title)
    return {"results": results}

@app.get("/api/new-articles")
async def new_articles(limit: int = 25, period: str = "24h", anon_only: bool = False, user: str = None, title: str = None):
    """
    Get new articles.
    """
    results = await wiki_client.get_new_articles(limit=limit, period=period, anon_only=anon_only, user=user, title=title)
    return {"results": results}

@app.get("/api/top-viewed")
async def top_viewed(limit: int = 25, period: str = "24h", user: str = None, title: str = None):
    """
    Get top viewed articles.
    """
    results = await wiki_client.get_top_viewed_articles(limit=limit, period=period, user=user, title=title)
    return {"results": results}

@app.get("/api/diff")
async def get_diff(revid: int):
    """
    Get diff HTML for a revision.
    """
    diff_html = await wiki_client.get_diff(revid)
    return {"diff": diff_html}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
