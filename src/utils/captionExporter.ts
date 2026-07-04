import { Caption } from "../types";

/**
 * Formats a duration in seconds to standard SRT timestamp format (HH:MM:SS,mmm)
 */
export function formatSRTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (num: number, size = 2) => String(num).padStart(size, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

/**
 * Converts a list of captions to standard SRT subtitle file string
 */
export function captionsToSRT(captions: Caption[]): string {
  return captions
    .map((caption, index) => {
      const num = index + 1;
      const timeRange = `${formatSRTTime(caption.start)} --> ${formatSRTTime(caption.end)}`;
      return `${num}\n${timeRange}\n${caption.text}\n`;
    })
    .join('\n');
}

/**
 * Converts a list of captions to a clean readable text transcript
 */
export function captionsToTXT(captions: Caption[]): string {
  return captions
    .map((caption) => {
      const minutes = Math.floor(caption.start / 60);
      const seconds = Math.floor(caption.start % 60);
      const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
      return `${timestamp} ${caption.text}`;
    })
    .join('\n');
}

/**
 * Formats duration in seconds to JSON timestamp format (HH:MM:SS.mmm)
 */
export function formatJSONTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (num: number, size = 2) => String(num).padStart(size, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

/**
 * Converts a list of captions to standard JSON formatted string as requested
 */
export function captionsToJSON(captions: Caption[]): string {
  const jsonArr = captions.map((caption) => ({
    text: caption.text,
    start: formatJSONTime(caption.start),
    end: formatJSONTime(caption.end),
  }));
  return JSON.stringify(jsonArr, null, 2);
}

/**
 * Utility to download a text content as a file using a robust two-step server-side endpoint.
 * This completely avoids browser/iframe download blocks and prevents 404/sandboxing errors.
 */
export async function downloadFile(content: string, fileName: string, mimeType: string) {
  try {
    const response = await fetch("/api/prepare-text-download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, fileName, mimeType }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.downloadUrl) {
      // Create a temporary hidden link and click it to trigger native GET download.
      // This is the most compatible way across all Android/iOS/Desktop browsers.
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 200);
    } else {
      throw new Error(data.error || "Failed to receive transcode download path.");
    }
  } catch (err) {
    console.error("Server-side prepare download failed, trying standard blob fallback:", err);
    // Standard blob fallback
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  }
}
