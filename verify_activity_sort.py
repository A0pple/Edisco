import asyncio
from wiki_client import WikiClient
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)

async def verify_activity_sorting():
    client = WikiClient()
    
    print("\n--- Testing Sort by DATE (Last Updated) ---")
    results = await client.get_top_edited_articles(limit=10, sort="date")
    
    last_ts = "9999-99-99T99:99:99Z"
    for i, page in enumerate(results):
        ts = page.get("last_timestamp", "N/A")
        print(f"#{i+1}: {page['title']} (Last Updated: {ts})")
        if ts > last_ts:
            print(f"ERROR: Date sort failed! {ts} is newer than {last_ts}")
            return
        last_ts = ts
        
    print("\n--- Testing Sort by COUNT (Most Edited) ---")
    results = await client.get_top_edited_articles(limit=10, sort="count")
    
    last_count = 999999
    for i, page in enumerate(results):
        count = page.get("count", 0)
        print(f"#{i+1}: {page['title']} (Count: {count})")
        if count > last_count:
             print(f"ERROR: Count sort failed! {count} is bigger than {last_count}")
             return
        last_count = count

    print("\nVerification Passed!")

if __name__ == "__main__":
    asyncio.run(verify_activity_sorting())
