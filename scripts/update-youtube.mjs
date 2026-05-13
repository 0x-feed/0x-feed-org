import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const CHANNEL_URL = process.env.YOUTUBE_CHANNEL_URL || "https://www.youtube.com/";
const OUTPUT_PATH = process.env.OUTPUT_PATH || "data/youtube-videos.json";
const MAX_RESULTS = Math.min(Number(process.env.MAX_RESULTS || 9), 50);

if (!API_KEY) {
  throw new Error("Missing YOUTUBE_API_KEY environment variable.");
}

if (!CHANNEL_ID) {
  throw new Error("Missing YOUTUBE_CHANNEL_ID environment variable.");
}

const API_ROOT = "https://www.googleapis.com/youtube/v3";

function apiUrl(endpoint, params) {
  const url = new URL(`${API_ROOT}/${endpoint}`);
  Object.entries({ ...params, key: API_KEY }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`YouTube API ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function pickThumbnail(thumbnails = {}) {
  const order = ["maxres", "standard", "high", "medium", "default"];
  for (const key of order) {
    if (thumbnails[key]?.url) return thumbnails[key].url;
  }
  return "";
}

function cleanDescription(description = "", limit = 170) {
  const normalized = description
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^https?:\/\//i.test(line))
    .filter(line => !/^#/.test(line))
    .filter(line => !/^(subscribe|follow|links?|resources?):?/i.test(line));

  const text = (normalized[0] || description)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, "")}...`;
}

async function getUploadsPlaylistId() {
  const data = await fetchJson(apiUrl("channels", {
    part: "snippet,contentDetails",
    id: CHANNEL_ID
  }));

  const channel = data.items?.[0];
  if (!channel) {
    throw new Error(`No YouTube channel found for id ${CHANNEL_ID}.`);
  }

  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error(`No uploads playlist found for channel ${CHANNEL_ID}.`);
  }

  return {
    uploadsPlaylistId,
    channelTitle: channel.snippet?.title || "0xFEED"
  };
}

async function getLatestUploads(playlistId) {
  const data = await fetchJson(apiUrl("playlistItems", {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: MAX_RESULTS
  }));

  return (data.items || [])
    .map(item => {
      const snippet = item.snippet || {};
      const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId;
      return {
        id: videoId,
        title: snippet.title || "",
        description: cleanDescription(snippet.description || ""),
        publishedAt: snippet.publishedAt || item.contentDetails?.videoPublishedAt || "",
        thumbnail: pickThumbnail(snippet.thumbnails),
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""
      };
    })
    .filter(video => {
      const title = video.title.toLowerCase();
      return video.id && video.url && video.thumbnail && title !== "deleted video" && title !== "private video";
    });
}

async function readExisting(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

const { uploadsPlaylistId, channelTitle } = await getUploadsPlaylistId();
const videos = await getLatestUploads(uploadsPlaylistId);

const output = {
  updatedAt: new Date().toISOString(),
  channelId: CHANNEL_ID,
  channelTitle,
  channelUrl: CHANNEL_URL,
  videos
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
const existing = await readExisting(OUTPUT_PATH);

if (existing !== serialized) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, serialized, "utf8");
  console.log(`Updated ${OUTPUT_PATH} with ${videos.length} videos.`);
} else {
  console.log(`${OUTPUT_PATH} is already current.`);
}
