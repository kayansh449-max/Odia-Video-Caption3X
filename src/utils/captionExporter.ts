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
 * Utility to download a text content as a file
 */
export function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  
  // Use a short delay before removing the element and revoking the URL.
  // This is a CRITICAL fix for iframe sandboxes, preventing the browser
  // from cancelling the download before the event loop can process the click.
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 150);
}
