// Podcast RSS parser supporting iTunes and Podcasting 2.0 namespaces.
// Strict Zero-Disk Policy: Never saves raw audio to local disk.
import { XMLParser } from "fast-xml-parser";
import { collapseWhitespace, stripTags } from "../lib/text.ts";

export interface ParsedPodcastEpisode {
  guid: string;
  title: string;
  link: string;
  audioUrl: string;
  audioDurationSec?: number;
  audioDurationStr?: string;
  publishedAt: Date;
  author?: string;
  showNotes: string;
  coverUrl?: string;
  transcriptUrl?: string;
}

export interface ParsedPodcastFeed {
  title: string;
  description: string;
  link?: string;
  author?: string;
  coverUrl?: string;
  episodes: ParsedPodcastEpisode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#cdata" in o) return text(o["#cdata"]);
    if ("#text" in o) return text(o["#text"]);
  }
  return "";
}

function parseDuration(val: unknown): { sec?: number; str?: string } {
  const str = text(val);
  if (!str) return {};
  if (/^\d+$/.test(str)) {
    const totalSec = Number(str);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const formatted = h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return { sec: totalSec, str: formatted };
  }
  const parts = str.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return { str };
  let sec = 0;
  if (parts.length === 3) {
    sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    sec = parts[0] * 60 + parts[1];
  }
  return { sec, str };
}

function extractLink(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) {
    const alt = v.find((l: any) => l && typeof l === "object" && l["@rel"] === "alternate") || v[0];
    return extractLink(alt);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("@href" in o) return String(o["@href"]).trim();
    if ("#text" in o) return String(o["#text"]).trim();
  }
  return "";
}

export function parsePodcastFeedXml(xml: string): ParsedPodcastFeed {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = (doc.rss || doc.feed || doc) as Record<string, unknown>;
  const channel = (rss.channel || rss) as Record<string, unknown>;

  const channelTitle = text(channel.title) || "Untitled Podcast";
  const channelDesc = text(channel.description) || text(channel.subtitle) || text(channel.summary) || "";
  const channelLink = extractLink(channel.link);
  const channelAuthor =
    text(channel["itunes:author"]) ||
    (channel.author && typeof channel.author === "object" ? text((channel.author as any).name) : text(channel.author)) ||
    "";
  const channelCover =
    (channel["itunes:image"] as Record<string, string> | undefined)?.["@href"] ||
    (channel.image as Record<string, string> | undefined)?.url ||
    (channel.icon as string | undefined) ||
    (channel.logo as string | undefined) ||
    "";

  const rawItems = (channel.item || channel.entry || []) as unknown;
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const episodes: ParsedPodcastEpisode[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;

    const title = text(it.title);
    if (!title) continue;

    const ytVideoId = text(it["yt:videoId"]);
    const guid = ytVideoId || text(it.guid) || text(it.id) || extractLink(it.link) || title;
    let link = extractLink(it.link);
    if (!link && ytVideoId) {
      link = `https://www.youtube.com/watch?v=${ytVideoId}`;
    }
    if (!link) link = channelLink;

    // Enclosure (audio file)
    let audioUrl = "";
    if (it.enclosure) {
      const encObj = Array.isArray(it.enclosure) ? it.enclosure[0] : it.enclosure;
      if (encObj && typeof encObj === "object") {
        audioUrl = (encObj as Record<string, string>)["@url"] || "";
      }
    }
    if (!audioUrl && it["media:content"]) {
      const mcObj = Array.isArray(it["media:content"]) ? it["media:content"][0] : it["media:content"];
      if (mcObj && typeof mcObj === "object") {
        audioUrl = (mcObj as Record<string, string>)["@url"] || "";
      }
    }
    // Fallback audioUrl to direct link if no audio enclosure is present (e.g. YouTube video)
    if (!audioUrl && link) {
      audioUrl = link;
    }

    const mediaGroup = it["media:group"] as Record<string, unknown> | undefined;

    let { sec: audioDurationSec, str: audioDurationStr } = parseDuration(it["itunes:duration"]);
    if (!audioDurationSec && mediaGroup?.["media:content"]) {
      const mc = Array.isArray(mediaGroup["media:content"]) ? mediaGroup["media:content"][0] : mediaGroup["media:content"];
      if (mc && typeof mc === "object" && mc["@duration"]) {
        const d = parseDuration(mc["@duration"]);
        audioDurationSec = d.sec;
        audioDurationStr = d.str;
      }
    }

    const pubDateStr = text(it.pubDate) || text(it.published) || text(it.updated);
    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

    const author =
      text(it["itunes:author"]) ||
      (it.author && typeof it.author === "object" ? text((it.author as any).name) : text(it.author)) ||
      channelAuthor;

    const rawContent =
      text(it["content:encoded"]) ||
      text(mediaGroup?.["media:description"]) ||
      text(it.description) ||
      text(it["itunes:summary"]) ||
      text(it.summary);
    const showNotes = collapseWhitespace(stripTags(rawContent));

    let coverUrl =
      (it["itunes:image"] as Record<string, string> | undefined)?.["@href"] ||
      (mediaGroup?.["media:thumbnail"] as Record<string, string> | undefined)?.["@url"] ||
      (Array.isArray(mediaGroup?.["media:thumbnail"]) ? (mediaGroup?.["media:thumbnail"] as any[])[0]?.["@url"] : undefined);
    if (!coverUrl && ytVideoId) {
      coverUrl = `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`;
    }
    if (!coverUrl) coverUrl = channelCover;

    // Podcasting 2.0 transcript tag
    let transcriptUrl: string | undefined;
    if (it["podcast:transcript"] && typeof it["podcast:transcript"] === "object") {
      const tr = it["podcast:transcript"] as Record<string, string>;
      transcriptUrl = tr["@url"] || undefined;
    }

    episodes.push({
      guid,
      title,
      link,
      audioUrl,
      audioDurationSec,
      audioDurationStr,
      publishedAt: Number.isNaN(pubDate.getTime()) ? new Date() : pubDate,
      author,
      showNotes,
      coverUrl,
      transcriptUrl,
    });
  }

  return {
    title: channelTitle,
    description: channelDesc,
    link: channelLink,
    author: channelAuthor,
    coverUrl: channelCover,
    episodes,
  };
}
