
import asyncio
from wiki_client import WikiClient
import re

async def check_talk_comments():
    client = WikiClient()
    # Fetch recent talk page edits
    edits = await client.get_recent_edits(limit=50, namespace=1)
    
    print(f"Fetched {len(edits)} edits")
    
    for edit in edits:
        comment = edit.get('comment', '')
        title = edit.get('title', '')
        print(f"Page: {title}")
        print(f"Comment: {comment}")
        
        # Try to extract section
        match = re.search(r'/\*\s*(.*?)\s*\*/', comment)
        if match:
            print(f"Found Section: {match.group(1)}")
        print("-" * 20)

    await client.close()

if __name__ == "__main__":
    asyncio.run(check_talk_comments())
