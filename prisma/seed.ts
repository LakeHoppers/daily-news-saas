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
  // Publisher-discovered feeds, HTTP and RSS/Atom validated 2026-09-08.
  {
    name: "heise online",
    url: "https://www.heise.de/rss/heise-atom.xml",
    category: "TECHNOLOGY" as const,
    trustScore: 90,
  },
  {
    name: "Sportschau – Sportmeldungen",
    url: "https://www.sportschau.de/index~rss2.xml",
    category: "SPORTS" as const,
    trustScore: 90,
  },
  {
    name: "Deutschlandfunk – Gesellschaft",
    url: "https://www.deutschlandfunk.de/gesellschaft-106.rss",
    category: "SOCIETY" as const,
    trustScore: 90,
  },
  {
    name: "Handelsblatt – Unternehmen",
    url: "https://feeds.cms.handelsblatt.com/unternehmen",
    category: "BUSINESS" as const,
    trustScore: 85,
  },
  {
    name: "BAMF – Aktuelle Meldungen",
    url: "https://www.bamf.de/SiteGlobals/Functions/RSS/DE/Feed/RSSNewsfeed_Meldungen.xml?nn=282672",
    category: "IMMIGRATION" as const,
    trustScore: 90,
  },
  {
    name: "Berliner Zeitung – Mensch & Metropole",
    url: "https://www.berliner-zeitung.de/feed.id_mensch_und_metropole.xml",
    category: "BERLIN" as const,
    trustScore: 80,
  },
  {
    name: "Deutschlandfunk – Europa",
    url: "https://www.deutschlandfunk.de/europa-112.rss",
    category: "EUROPE" as const,
    trustScore: 90,
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
