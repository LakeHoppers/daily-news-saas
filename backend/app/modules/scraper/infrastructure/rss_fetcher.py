import httpx

from app.modules.parser.infrastructure.rss import MAX_BYTES, parse_feed


class RssFetcher:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def fetch(self, url):
        async with self.client.stream("GET", url) as response:
            response.raise_for_status()
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise ValueError("Feed too large")
        xml = bytes(data)
        return xml, parse_feed(xml, url)
