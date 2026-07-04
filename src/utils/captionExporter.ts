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
 * Utility to download a text content as a file using a server-side high-compatibility form submission
 */
export function downloadFile(content: string, fileName: string, mimeType: string) {
  try {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/download-text";
    form.style.display = "none";

    const contentInput = document.createElement("input");
    contentInput.type = "hidden";
    contentInput.name = "content";
    contentInput.value = content;
    form.appendChild(contentInput);

    const fileNameInput = document.createElement("input");
    fileNameInput.type = "hidden";
    fileNameInput.name = "fileName";
    fileNameInput.value = fileName;
    form.appendChild(fileNameInput);

    const mimeInput = document.createElement("input");
    mimeInput.type = "hidden";
    mimeInput.name = "mimeType";
    mimeInput.value = mimeType;
    form.appendChild(mimeInput);

    document.body.appendChild(form);
    form.submit();

    // Clean up from DOM after a small delay
    setTimeout(() => {
      document.body.removeChild(form);
    }, 200);
  } catch (err) {
    console.error("Native form download failed, trying blob fallback:", err);
    // Blob fallback (in case something unexpected fails)
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
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
