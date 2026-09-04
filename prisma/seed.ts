import "dotenv/config";
import { prisma } from "../src/shared/prisma";

const sources = [
  {
    name: "Tagesschau",
    url: "https://www.tagesschau.de/xml/rss2/",
    category: "POLITICS" as const,
    trustScore: 95,
  },
  {
    name: "Süddeutsche Zeitung – Topthemen",
    url: "https://rss.sueddeutsche.de/rss/Topthemen",
    category: "POLITICS" as const,
    trustScore: 85,
  },
  {
    name: "FAZ – Aktuell",
    url: "https://www.faz.net/rss/aktuell/",
    category: "ECONOMY" as const,
    trustScore: 85,
  },
  {
    name: "Zeit Online",
    url: "https://newsfeed.zeit.de/index",
    category: "POLITICS" as const,
    trustScore: 85,
  },
  {
    name: "Spiegel Online – Schlagzeilen",
    url: "https://www.spiegel.de/schlagzeilen/index.rss",
    category: "POLITICS" as const,
    trustScore: 80,
  },
  {
    name: "Handelsblatt – Schlagzeilen",
    url: "https://www.handelsblatt.com/contentexport/feed/schlagzeilen",
    category: "ECONOMY" as const,
    trustScore: 85,
  },
  {
    name: "Tagesspiegel – Berlin",
    url: "https://www.tagesspiegel.de/contentexport/feed/home",
    category: "BERLIN" as const,
    trustScore: 75,
  },
  {
    name: "Deutsche Welle – Deutsch",
    url: "https://rss.dw.com/xml/rss-de-all",
    category: "EUROPE" as const,
    trustScore: 80,
  },
];

async function main() {
  for (const source of sources) {
    await prisma.source.upsert({
      where: { url: source.url },
      create: { ...source, type: "RSS" },
      update: { name: source.name, category: source.category, trustScore: source.trustScore },
    });
  }
  console.log(`Seeded ${sources.length} sources.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
