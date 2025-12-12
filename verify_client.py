import asyncio
from wiki_client import WikiClient

async def main():
    client = WikiClient()
    try:
        print("Fetching top viewed articles...")
        results = await client.get_top_viewed_articles(limit=5)
        print(f"Got {len(results)} results")
        for r in results:
            print(f"{r['rank']}: {r['title']} ({r['views']} views)")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
