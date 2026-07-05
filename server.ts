import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Set high limits for file-to-base64 transfers
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Custom CORS middleware to allow cross-origin requests from APK/mobile WebViews
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-gemini-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Initializer for Gemini Client
function getGeminiClient(customApiKey?: string): GoogleGenAI {
  let apiKey = customApiKey;
  if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
    apiKey = process.env.GEMINI_API_KEY;
  }
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// 1. API: Transcribe Audio using Gemini 3.5 Flash (Speech-to-Text)
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audio, language, duration, apiKey: bodyApiKey } = req.body;
    const headerApiKey = req.headers["x-gemini-api-key"] as string;
    const clientApiKey = bodyApiKey || headerApiKey;

    if (!audio) {
      return res.status(400).json({ error: "Missing audio base64 payload" });
    }

    const targetLang = language || "Odia";

    // Check if API key is present
    try {
      const ai = getGeminiClient(clientApiKey);

      // Convert input base64 wav to Buffer to prepare for slicing
      const wavBuffer = Buffer.from(audio, "base64");
      const rawPcm = wavBuffer.subarray(44); // skip 44-byte WAV header to get raw 16kHz PCM samples

      let captions: CaptionSegment[] = [];
      let modelUsed = "";
      let chunkedSuccess = false;

      // Calculate exact duration from raw PCM samples (each sample is 2 bytes at 16000 Hz sample rate)
      const totalSamples = rawPcm.length / 2;
      const totalDuration = totalSamples / 16000;

      // Only attempt chunk-based transcription for files > 15s to bypass rate limits on small clips
      if (totalDuration > 15) {
        try {
          console.log(`[STT] Audio duration is ${totalDuration.toFixed(2)} seconds. Transcribing in dynamic time chunks to guarantee zero timing drift...`);
          captions = await transcribeAudioInChunks(ai, rawPcm, targetLang);
          modelUsed = "gemini-3.5-flash-chunked";
          chunkedSuccess = true;
          console.log(`[STT] Chunk-based transcription completed successfully! Generated ${captions.length} captions.`);
        } catch (chunkErr: any) {
          console.warn(`[STT] Chunk-based transcription failed: ${chunkErr.message || chunkErr}. Falling back to global transcription...`);
        }
      }

      // Global transcription fallback if chunking is not used, failed, or rate-limited
      if (!chunkedSuccess) {
        const audioPart = {
          inlineData: {
            data: audio,
            mimeType: "audio/wav",
          },
        };

        const parsedDuration = duration ? parseFloat(duration) : totalDuration;
        const durationText = (parsedDuration && !isNaN(parsedDuration)) 
          ? `The total duration of the provided audio file is exactly ${parsedDuration.toFixed(2)} seconds. You MUST strictly calibrate and synchronize all start and end timestamps within this 0.0 to ${parsedDuration.toFixed(2)} seconds timeline.`
          : "";

        const promptPart = `You are an ultra-precise speech transcription and timing alignment engine.
Analyze the speech in the provided audio file.

CRITICAL REQUIREMENT:
${durationText}
- Define segments based on natural phrases or clauses (approx 3 to 7 words per segment, matching natural speech breath boundaries).
- The start and end timestamps (in seconds, up to 2 decimal places) for every phrase segment MUST match the EXACT time the speaker starts and ends speaking that phrase in the audio.
- DO NOT estimate, drift, or delay timings. Listen for the exact vocal onset (when the voice starts speaking the first word) and set the 'start' field to that exact millisecond time, and set 'end' to when the speaker finishes speaking the last word in that phrase.
- AVOID ACCUMULATIVE DRIFT: Ensure that timestamps do not progressively drift/lag behind the audio over time. Keep timings tightly bound to actual speech audio.

Instructions:
1. Transcribe the spoken text exactly into the target language requested: "${targetLang}".
   - If target language is "Odia", write using the Odia script (e.g. "ନମସ୍କାର ବନ୍ଧୁଗଣ, ଆଜିର ଏହି ଭିଡିଓରେ...").
   - If target language is "Hindi", write using the Hindi Devanagari script (e.g. "नमस्ते दोस्तों, आज के इस वीडियो में...").
   - If target language is "English", write using clean English.
2. Segment the transcript into natural speaking phrases of 3 to 7 words each (about 1.5 to 3.5 seconds in duration).
3. Align each phrase with ultra-precise start and end times in seconds (e.g. start: 1.25, end: 3.82).
4. Do not include silent parts or background music gaps in segments. The segment must start exactly when the speech begins and pause when there is silence or no speaking.
5. Ensure absolutely no overlapping segments (i.e. segment N's 'end' must be less than or equal to segment N+1's 'start').
6. Return the result strictly conforming to the requested JSON Schema array.`;

        // Multi-model backup cascade for absolute stability
        let geminiResponse = null;
        const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

        // Cascade Stage 1: Try with Structured JSON Schema
        for (const model of modelsToTry) {
          try {
            console.log(`[STT] Trying ${model} with Structured JSON Schema...`);
            geminiResponse = await ai.models.generateContent({
              model: model,
              contents: [audioPart, promptPart],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  description: "An array of subtitles with start/end times and captions",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING, description: "The transcribed subtitle text in requested language script." },
                      start: { type: Type.NUMBER, description: "The start time of this subtitle segment in seconds." },
                      end: { type: Type.NUMBER, description: "The end time of this subtitle segment in seconds." },
                    },
                    required: ["text", "start", "end"],
                  },
                },
              },
            });
            if (geminiResponse && geminiResponse.text) {
              modelUsed = `${model}-structured`;
              break;
            }
          } catch (schemaErr: any) {
            console.warn(`[STT] Structured output failed on ${model}: ${schemaErr.message}`);
          }
        }

        // Cascade Stage 2: Fallback to Standard JSON Response Mime Type (without strict schema)
        if (!geminiResponse) {
          for (const model of modelsToTry) {
            try {
              console.log(`[STT] Falling back to ${model} with Standard JSON config...`);
              geminiResponse = await ai.models.generateContent({
                model: model,
                contents: [
                  audioPart,
                  promptPart + "\n\nCRITICAL: Return the response strictly as a JSON array of caption objects containing text, start, and end fields. Do not include any other text outside the JSON block."
                ],
                config: {
                  responseMimeType: "application/json"
                }
              });
              if (geminiResponse && geminiResponse.text) {
                modelUsed = `${model}-standard-json`;
                break;
              }
            } catch (jsonErr: any) {
              console.warn(`[STT] Standard JSON config failed on ${model}: ${jsonErr.message}`);
            }
          }
        }

        // Cascade Stage 3: Emergency raw text attempt
        if (!geminiResponse) {
          try {
            console.log("[STT] Falling back to gemini-3.1-flash-lite with raw prompt...");
            geminiResponse = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: [
                audioPart,
                promptPart + "\n\nFormat your output strictly as a JSON array. Avoid any other conversational text. Example: [{\"text\": \"hello\", \"start\": 0.0, \"end\": 1.5}]"
              ]
            });
            modelUsed = "gemini-3.1-flash-lite-raw";
          } catch (rawErr: any) {
            console.error("[STT] Raw transcription failed completely:", rawErr.message);
            throw new Error(`All transcription models failed. Gemini API reported: ${rawErr.message}`);
          }
        }

        const responseText = geminiResponse?.text;
        if (!responseText) {
          throw new Error("Empty response received from the Gemini model.");
        }

        const cleanedText = cleanJsonResponse(responseText);
        let rawCaptions;
        try {
          rawCaptions = JSON.parse(cleanedText);
        } catch (e) {
          console.warn("[STT] JSON.parse on global response failed, using manual parse fallback:", e);
          rawCaptions = tryManualJsonParse(cleanedText);
        }

        if (!Array.isArray(rawCaptions) || rawCaptions.length === 0) {
          throw new Error("Gemini response is not a valid subtitles array.");
        }

        // Programmatically split phrase-level captions into ultra-precise punchy chunks
        captions = splitPhrasesIntoPunchyChunks(rawCaptions);
      }

      return res.json({
        success: true,
        captions,
        simulation: false,
        language: targetLang,
        model: modelUsed,
      });

    } catch (apiError: any) {
      // If API Key is missing or invalid, generate smart fallback subtitles so the preview works beautifully
      console.warn("Gemini transcription failed or API Key is missing. Using smart simulation mode.", apiError.message);
      
      const fileDuration = duration || 10;
      const simulatedCaptions = generateSimulatedCaptions(targetLang, fileDuration);

      return res.json({
        success: true,
        captions: simulatedCaptions,
        simulation: true,
        language: targetLang,
        errorDetail: apiError.message || "Unknown transcription error",
        message: "Running in local simulation mode. Add GEMINI_API_KEY to secrets for actual AI audio transcription.",
      });
    }
  } catch (error: any) {
    console.error("Transcribing handler error:", error);
    res.status(500).json({ error: error.message || "Failed to process audio transcription" });
  }
});

// API: Test API Key
app.post("/api/test-key", async (req, res) => {
  try {
    const { apiKey: bodyApiKey } = req.body;
    const headerApiKey = req.headers["x-gemini-api-key"] as string;
    const clientApiKey = bodyApiKey || headerApiKey;

    if (!clientApiKey) {
      return res.status(400).json({ success: false, error: "No API Key provided." });
    }

    try {
      const ai = getGeminiClient(clientApiKey);
      
      // Quick test prompt (asking for a simple message)
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: "Say 'Hello, API Key is working perfectly!' in Odia script and English script in one line."
      });

      return res.json({
        success: true,
        message: response.text || "Connected successfully!",
      });
    } catch (testError: any) {
      console.warn("Test API key with gemini-3.5-flash failed, trying gemini-3.1-flash-lite fallback:", testError.message);
      // Fallback to gemini-3.1-flash-lite for testing
      const ai = getGeminiClient(clientApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: "Say 'Hello, API Key is working perfectly!' in Odia script and English script in one line."
      });

      return res.json({
        success: true,
        message: response.text || "Connected successfully with 3.1-flash-lite!",
      });
    }
  } catch (error: any) {
    console.error("API Key check failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to verify API Key.",
    });
  }
});

// Helper to strip markdown code fences from JSON strings
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  
  // Find first array bracket '[' and last array bracket ']'
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  } else {
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/i, "");
      cleaned = cleaned.replace(/\n?```$/, "");
    }
  }
  return cleaned.trim();
}

// Fallback robust manual JSON-like parsing for safety
function tryManualJsonParse(text: string): any[] {
  const list: any[] = [];
  // Regex to match JSON-like objects with text, start, and end fields
  const regex = /\{\s*(?:"text"|'text')\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*(?:"start"|'start')\s*:\s*([0-9.]+)\s*,\s*(?:"end"|'end')\s*:\s*([0-9.]+)\s*\}/gi;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      let rawText = match[1];
      if (rawText.startsWith('"') && rawText.endsWith('"')) {
        rawText = rawText.slice(1, -1);
      } else if (rawText.startsWith("'") && rawText.endsWith("'")) {
        rawText = rawText.slice(1, -1);
      }
      const start = parseFloat(match[2]);
      const end = parseFloat(match[3]);
      if (!isNaN(start) && !isNaN(end)) {
        list.push({
          text: rawText.replace(/\\"/g, '"').replace(/\\'/g, "'").trim(),
          start,
          end
        });
      }
    } catch (err) {
      // ignore
    }
  }

  // If precise regex is unsuccessful, use a looser parser
  if (list.length === 0) {
    const looseRegex = /\{([^}]+)\}/g;
    let looseMatch;
    while ((looseMatch = looseRegex.exec(text)) !== null) {
      try {
        const block = looseMatch[1];
        const textMatch = /["']text["']\s*:\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/i.exec(block);
        const startMatch = /["']start["']\s*:\s*([0-9.]+)/i.exec(block);
        const endMatch = /["']end["']\s*:\s*([0-9.]+)/i.exec(block);

        if (textMatch && startMatch && endMatch) {
          let t = textMatch[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
          const s = parseFloat(startMatch[1]);
          const e = parseFloat(endMatch[1]);
          if (!isNaN(s) && !isNaN(e)) {
            list.push({ text: t, start: s, end: e });
          }
        }
      } catch (err) {}
    }
  }

  return list;
}

interface CaptionSegment {
  text: string;
  start: number;
  end: number;
}

// Programmatically splits longer phrase-level subtitles into fast, modern 1-2 word chunks.
// Uses a character-weighted distribution within the phrase's verified boundary.
// This completely solves the cumulative sequential generation lag of LLM speech-to-text!
function splitPhrasesIntoPunchyChunks(phrases: CaptionSegment[]): CaptionSegment[] {
  const result: CaptionSegment[] = [];

  for (const phrase of phrases) {
    const text = phrase.text ? phrase.text.trim() : "";
    if (!text) continue;

    // Split text into individual words
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) continue;

    const start = phrase.start;
    const end = phrase.end;
    const duration = end - start;

    if (duration <= 0 || words.length <= 2) {
      // If duration is invalid or phrase has only 1-2 words, keep it as is
      result.push({ text, start: parseFloat(start.toFixed(2)), end: parseFloat(end.toFixed(2)) });
      continue;
    }

    // Calculate word-level character lengths to distribute time proportionally
    const wordLengths = words.map(w => w.length);
    const totalChars = wordLengths.reduce((sum, len) => sum + len, 0);

    // Compute precise start/end times for each individual word
    const wordTimings: { word: string; start: number; end: number }[] = [];
    let currentStart = start;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const charRatio = word.length / totalChars;
      const wordDur = charRatio * duration;
      const wordEnd = currentStart + wordDur;
      
      wordTimings.push({
        word,
        start: currentStart,
        end: wordEnd
      });

      currentStart = wordEnd;
    }

    // Now, group these individual words into punchy chunks of 4-7 words (optimal landscape/premium readability)
    let j = 0;
    while (j < wordTimings.length) {
      const remainingWords = wordTimings.length - j;
      let wordsInThisChunk = 5; // standard target is 5 words per line

      if (remainingWords <= 7) {
        // If 7 or fewer words are remaining, put them all in one chunk, which can then be elegantly split into 1 or 2 lines by the templates
        wordsInThisChunk = remainingWords;
      } else if (remainingWords === 8) {
        // split into two balanced chunks of 4 words
        wordsInThisChunk = 4;
      } else if (remainingWords === 9) {
        // split into 5 and 4 words
        wordsInThisChunk = 5;
      }

      const chunkWords: string[] = [];
      const chunkStart = wordTimings[j].start;
      let chunkEnd = chunkStart;

      for (let k = 0; k < wordsInThisChunk && j < wordTimings.length; k++) {
        chunkWords.push(wordTimings[j].word);
        chunkEnd = wordTimings[j].end;
        j++;
      }

      result.push({
        text: chunkWords.join(" "),
        start: parseFloat(chunkStart.toFixed(2)),
        end: parseFloat(chunkEnd.toFixed(2))
      });
    }
  }

  // Ensure sorting and non-overlapping timestamps
  result.sort((a, b) => a.start - b.start);
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].end > result[i+1].start) {
      result[i].end = result[i+1].start;
    }
  }

  return result;
}

// Generates a standard WAV header buffer for raw 16-bit 16kHz Mono PCM bytes
function createWavHeader(pcmLength: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const numChannels = 1;
  const bitDepth = 16;
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format (1)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmLength, 40);

  return header;
}

// Chunked audio transcription method: splits audio to zero-drift chunks, transcribes, and merges
async function transcribeAudioInChunks(ai: GoogleGenAI, rawPcm: Buffer, targetLang: string): Promise<CaptionSegment[]> {
  const bytesPerSecond = 32000; // 16000 samples * 2 bytes/sample (16-bit Mono)
  
  const totalSamples = rawPcm.length / 2;
  const totalDuration = totalSamples / 16000;

  // Decide optimal chunk size based on length to maintain stability and prevent rate-limiting
  let chunkSizeSeconds = 30; // 30s chunks are ideal for Reels/Shorts with minimal boundary splits
  if (totalDuration > 120) {
    chunkSizeSeconds = 30;
  }

  const chunkSizeBytes = chunkSizeSeconds * bytesPerSecond;
  const chunks: { buffer: Buffer; offsetSeconds: number; durationSeconds: number }[] = [];

  for (let i = 0; i < rawPcm.length; i += chunkSizeBytes) {
    const pcmChunk = rawPcm.subarray(i, i + chunkSizeBytes);
    const offsetSeconds = i / bytesPerSecond;
    const durationSeconds = pcmChunk.length / bytesPerSecond;

    // Build complete WAV file for this specific chunk
    const header = createWavHeader(pcmChunk.length, 16000);
    const chunkWav = Buffer.concat([header, pcmChunk]);

    chunks.push({
      buffer: chunkWav,
      offsetSeconds,
      durationSeconds
    });
  }

  console.log(`[STT] Sliced audio into ${chunks.length} chunks of up to ${chunkSizeSeconds}s each.`);

  // Process all chunks concurrently using Gemini API
  const promises = chunks.map(async (chunk, idx) => {
    const base64Audio = chunk.buffer.toString("base64");
    const audioPart = {
      inlineData: {
        data: base64Audio,
        mimeType: "audio/wav"
      }
    };

    const chunkDuration = chunk.durationSeconds;
    const promptPart = `You are an ultra-precise speech transcription and timing alignment engine.
Analyze the speech in the provided audio file.

CRITICAL TIME REQUIREMENT:
- The audio duration is exactly ${chunkDuration.toFixed(2)} seconds.
- Every caption segment start and end timestamp MUST be strictly within 0.00 and ${chunkDuration.toFixed(2)} seconds.
- Timings must align perfectly with vocal speech onsets. Zero delays!
- Segment the transcript into short, natural phrase segments of 2 to 4 words each.
- Do not progressive drift/lag behind the audio. Keep timings tightly bound to actual speech audio.

Instructions:
1. Transcribe the spoken words exactly into the target language requested: "${targetLang}".
   - If target language is "Odia", write using the Odia script (e.g. "ନମସ୍କାର ବନ୍ଧୁଗଣ").
   - If target language is "Hindi", write using the Hindi Devanagari script (e.g. "नमस्ते दोस्तों").
   - If target language is "English", write using clean English.
2. Segment the speech into small, natural phrase segments of 2 to 4 words each.
3. Align each phrase with ultra-precise start and end times in seconds relative to the start of this audio clip (from 0.00 to ${chunkDuration.toFixed(2)}).
4. Do not include silent parts or musical interludes.
5. Return the result strictly conforming to the requested JSON Schema array.`;

    let chunkResponse = null;
    try {
      chunkResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [audioPart, promptPart],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "Array of subtitles with timings relative to this chunk (0.0 to duration)",
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "The transcribed subtitle text." },
                start: { type: Type.NUMBER, description: "Start time relative to this chunk (0.0 to chunk duration)." },
                end: { type: Type.NUMBER, description: "End time relative to this chunk (0.0 to chunk duration)." }
              },
              required: ["text", "start", "end"]
            }
          }
        }
      });
    } catch (err: any) {
      console.warn(`[STT] Chunk ${idx} structured generation failed, trying backup Lite model:`, err.message || err);
      // Fallback to 3.1-flash-lite if 3.5-flash is throttled
      chunkResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: [audioPart, promptPart],
        config: {
          responseMimeType: "application/json"
        }
      });
    }

    const textResult = chunkResponse?.text;
    if (!textResult) {
      throw new Error(`Empty transcription response for chunk ${idx}`);
    }

    const cleanedText = cleanJsonResponse(textResult);
    let parsedArray;
    try {
      parsedArray = JSON.parse(cleanedText);
    } catch (e) {
      console.warn(`[STT] JSON.parse on chunk ${idx} response failed, using manual parse fallback:`, e);
      parsedArray = tryManualJsonParse(cleanedText);
    }

    if (!Array.isArray(parsedArray)) {
      throw new Error(`Invalid JSON array response for chunk ${idx}`);
    }

    // Offset the timings of this chunk by its exact offsetSeconds to stitch it perfectly onto the global timeline!
    return parsedArray.map((item: any) => {
      // Ensure we clamp individual segment timestamps to within this chunk's boundaries
      let itemStart = Math.max(0, Math.min(chunkDuration, parseFloat(item.start)));
      let itemEnd = Math.max(itemStart + 0.1, Math.min(chunkDuration, parseFloat(item.end)));
      return {
        text: item.text ? item.text.trim() : "",
        start: parseFloat((itemStart + chunk.offsetSeconds).toFixed(2)),
        end: parseFloat((itemEnd + chunk.offsetSeconds).toFixed(2))
      };
    }).filter((item: any) => item.text && item.end > item.start);
  });

  const allChunkCaptions = await Promise.all(promises);
  const flattened = allChunkCaptions.flat();

  // Stitch them together cleanly, sort them, and programmatically divide phrases into modern, fast-paced punchy 1-2 word subtitles
  const finalizedPunchyCaptions = splitPhrasesIntoPunchyChunks(flattened);
  return finalizedPunchyCaptions;
}

// Helper to generate simulated subtitles based on language & video length
function generateSimulatedCaptions(language: string, duration: number) {
  const odiaPhrases = [
    "ନମସ୍କାର ବନ୍ଧୁଗଣ",
    "ସ୍ୱାଗତ କରୁଛି",
    "ଓଡ଼ିଆ ଅଟୋ କ୍ୟାପ୍ସନ",
    "ଏହି ଆପ୍ଲିକେସନ୍‌ରେ",
    "ଆପଣ ଅତି ସହଜରେ",
    "ଭିଡିଓରେ କ୍ୟାପ୍ସନ",
    "ଯୋଡ଼ି ପାରିବେ",
    "ଏହା ସମ୍ପୂର୍ଣ୍ଣ ମାଗଣା",
    "ଓ୍ବାଇରାଲ୍ ଟେମ୍ପଲେଟ୍",
    "ବ୍ୟବହାର କରି",
    "ଭିଡିଓକୁ ସୁନ୍ଦର କରନ୍ତୁ",
    "ଧନ୍ୟବାଦ ବନ୍ଧୁଗଣ"
  ];

  const hindiPhrases = [
    "नमस्कार दोस्तों",
    "स्वागत है आपका",
    "ओड़िया ऑटो कैप्शन",
    "इस कमाल के ऐप में",
    "आप बहुत आसानी से",
    "कैप्शन जनरेट",
    "कर सकते हैं",
    "यह बिल्कुल फ्री है",
    "वायरल टेम्पलेट्स",
    "यूज़ करके",
    "वीडियो वायरल करें",
    "चैनल सब्सक्राइब करें"
  ];

  const englishPhrases = [
    "Hello guys",
    "Welcome back",
    "Odia Auto Caption",
    "In this app",
    "You can easily",
    "Generate captions",
    "In one click",
    "Completely free",
    "Viral templates",
    "For reels and shorts",
    "Make it stunning",
    "Thanks for watching"
  ];

  const phrases = language === "Odia" ? odiaPhrases : (language === "Hindi" ? hindiPhrases : englishPhrases);
  const captions: any[] = [];
  
  // Distribute phrases across the duration (e.g. 1.5s per phrase)
  const segmentLength = 1.5;
  const numSegments = Math.min(phrases.length, Math.floor(duration / segmentLength));

  for (let i = 0; i < numSegments; i++) {
    const start = parseFloat((i * segmentLength + 0.3).toFixed(2));
    const end = parseFloat(((i + 1) * segmentLength - 0.1).toFixed(2));
    captions.push({
      text: phrases[i],
      start,
      end
    });
  }

  // If duration exceeds segments, repeat the sequence
  if (duration > numSegments * segmentLength) {
    let index = 0;
    let currentStart = numSegments * segmentLength + 0.3;
    while (currentStart < duration) {
      const start = parseFloat(currentStart.toFixed(2));
      const end = parseFloat((currentStart + segmentLength - 0.4).toFixed(2));
      if (end <= duration) {
        captions.push({
          text: phrases[index % phrases.length],
          start,
          end
        });
      }
      currentStart += segmentLength;
      index++;
    }
  }

  return captions;
}

// Helper to encode raw PCM buffer (24000Hz mono 16-bit little endian) into standard WAV format
function encodeWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const numChannels = 1; // mono
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  header.write("RIFF", 0); // ChunkID
  header.writeUInt32LE(chunkSize, 4); // ChunkSize
  header.write("WAVE", 8); // Format
  header.write("fmt ", 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  header.write("data", 36); // Subchunk2ID
  header.writeUInt32LE(dataSize, 40); // Subchunk2Size

  return Buffer.concat([header, pcmBuffer]);
}

// API: AI Voice Generation (Text-to-Speech with Multi-Character Timeline-Sync)
app.post("/api/synthesize", async (req, res) => {
  try {
    const { captions, voiceAssignments, defaultVoice, language, apiKey: bodyApiKey, style } = req.body;
    const headerApiKey = req.headers["x-gemini-api-key"] as string;
    const clientApiKey = bodyApiKey || headerApiKey;

    if (!captions || !Array.isArray(captions)) {
      return res.status(400).json({ error: "Missing or invalid captions array" });
    }

    const ai = getGeminiClient(clientApiKey);

    // Map of custom AI character categories to prebuilt voices and deep narrative prompt configurations
    const voiceMapping: Record<string, { voiceName: string, promptCue: string }> = {
      "Male Child": { 
        voiceName: "Puck", 
        promptCue: "Speak in a male child's high-pitched, cute, energetic, innocent, and sweet voice." 
      },
      "Young Boy": { 
        voiceName: "Puck", 
        promptCue: "Speak in a young boy's clear, bright, lively, and active voice." 
      },
      "Young Man": { 
        voiceName: "Fenrir", 
        promptCue: "Speak in an energetic, confident, crisp young man's voice." 
      },
      "Father": { 
        voiceName: "Fenrir", 
        promptCue: "Speak in a mature, deep, warm, fatherly, loving, and reassuring voice." 
      },
      "Elder Man / Grandfather": { 
        voiceName: "Charon", 
        promptCue: "Speak in an older grandfather's slow, wise, gentle, slightly shaky, aged and warm voice." 
      },
      "Female Child": { 
        voiceName: "Kore", 
        promptCue: "Speak in a sweet little female child's high-pitched, cute, playful, and adorable voice." 
      },
      "Young Girl": { 
        voiceName: "Kore", 
        promptCue: "Speak in a young girl's bright, friendly, lively, and cheerful voice." 
      },
      "Young Woman": { 
        voiceName: "Zephyr", 
        promptCue: "Speak in a young woman's elegant, clear, modern, extremely natural, and friendly voice." 
      },
      "Mother": { 
        voiceName: "Zephyr", 
        promptCue: "Speak in a mother's warm, gentle, caring, compassionate, highly affectionate, and calm voice." 
      },
      "Elder Woman / Grandmother": { 
        voiceName: "Zephyr", 
        promptCue: "Speak in an older grandmother's slow, gentle, warm, wise, compassionate, and reassuring elder voice." 
      }
    };

    const stylePrompts: Record<string, string> = {
      "Default": "Speak in a natural, neutral, clear narration tone of voice.",
      "Happy": "Speak with extremely high energy, happiness, excitement, cheerful laughter, and a bright smile in the voice.",
      "Sad": "Speak in a deeply emotional, crying, weeping, soft, trembling, sad, grieving and heartbroken voice.",
      "Suspense": "Speak in a quiet, whispering, highly mysterious, thriller, tense, intense, dark, suspenseful and dramatic tone of voice.",
      "Angry": "Speak with an aggressive, loud, angry, extremely serious, firm, commanding, authoritative and hostile tone of voice.",
      "Whispering": "Speak in an extremely quiet, soft, whispering, gentle, peaceful, low-volume and calm tone of voice."
    };

    // Helper to resolve the voice definition based on character assignment
    const getVoiceConfig = (caption: any) => {
      let voiceCategory = defaultVoice || "Young Woman";
      if (caption.character && voiceAssignments && voiceAssignments[caption.character]) {
        voiceCategory = voiceAssignments[caption.character];
      }
      return voiceMapping[voiceCategory] || voiceMapping["Young Woman"];
    };

    const targetLang = language || "Odia";
    console.log(`[TTS] Synthesizing ${captions.length} captions in ${targetLang} with style ${style || "Default"}...`);

    // We will generate the speech elements in parallel to maximize performance
    const synthesisPromises = captions.map(async (caption: any, index: number) => {
      // Clean up text by removing any character prefixes if present (e.g. "Arjun: ନମସ୍କାର" -> "ନମସ୍କାର")
      let cleanText = caption.text;
      const colonIndex = cleanText.indexOf(":");
      if (colonIndex !== -1 && colonIndex < 15) {
        cleanText = cleanText.substring(colonIndex + 1).trim();
      }

      const voiceConf = getVoiceConfig(caption);
      
      const currentStyle = caption.style || style || "Default";
      const styleInstruction = stylePrompts[currentStyle] || stylePrompts["Default"];
      
      // Setup natural pronunciation context for Gemini TTS API
      let langPronunciation = "";
      if (targetLang === "Odia") {
        langPronunciation = `Read the following Odia text (written in the Odia script) with natural, flawless Odia pronunciation: "${cleanText}"\nRequested Style/Emotion: ${styleInstruction}`;
      } else if (targetLang === "Hindi") {
        langPronunciation = `Read the following Hindi text (written in the Devanagari script) with natural, flawless Hindi pronunciation: "${cleanText}"\nRequested Style/Emotion: ${styleInstruction}`;
      } else {
        langPronunciation = `Read the following English text with natural, fluent English pronunciation: "${cleanText}"\nRequested Style/Emotion: ${styleInstruction}`;
      }

      const promptPart = `${voiceConf.promptCue}\n${langPronunciation}\nIMPORTANT: Strictly capture and output the tone/emotion of ${currentStyle} exactly with appropriate emotional pauses and vocal inflections.`;

      try {
        console.log(`[TTS] [Segment ${index}] Synthesizing text: "${cleanText}" using prebuilt voice: ${voiceConf.voiceName} and style: ${currentStyle}`);
        
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: promptPart }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceConf.voiceName },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error("Empty audio track returned from the Gemini TTS model.");
        }

        const buffer = Buffer.from(base64Audio, "base64");
        // Each 1 second of 24000Hz 16-bit PCM mono is 24000 * 2 = 48000 bytes
        const duration = buffer.length / 48000;

        return {
          index,
          start: parseFloat(caption.start),
          end: parseFloat(caption.end),
          buffer,
          duration,
          success: true
        };
      } catch (err: any) {
        console.error(`[TTS] [Segment ${index}] Failed:`, err.message);
        
        const lowerMsg = (err.message || "").toLowerCase();
        if (
          lowerMsg.includes("api key") || 
          lowerMsg.includes("apikey") || 
          lowerMsg.includes("invalid") || 
          lowerMsg.includes("permission_denied") || 
          lowerMsg.includes("unauthenticated") ||
          lowerMsg.includes("not found") ||
          lowerMsg.includes("key_missing")
        ) {
          throw err; // Escapes the map promise and triggers the outer catch block to report the exact error to client
        }

        // Fallback to seamless silent buffer for standard non-auth errors
        const duration = Math.max(0.5, parseFloat(caption.end) - parseFloat(caption.start));
        const silenceBuffer = Buffer.alloc(Math.ceil(duration * 24000) * 2);
        return {
          index,
          start: parseFloat(caption.start),
          end: parseFloat(caption.end),
          buffer: silenceBuffer,
          duration,
          success: false,
          error: err.message
        };
      }
    });

    const results = await Promise.all(synthesisPromises);

    // Calculate maximum end time to allocate the main composite buffer
    let maxEndTime = 0;
    results.forEach(res => {
      const endPos = res.start + res.duration;
      if (endPos > maxEndTime) {
        maxEndTime = endPos;
      }
    });

    if (maxEndTime <= 0) maxEndTime = 5; // safety fallback

    console.log(`[TTS] Timeline Composite compilation started. Full vocal track duration: ${maxEndTime.toFixed(2)}s`);

    // Allocate continuous PCM buffer (24000Hz * 2 bytes/sample)
    const finalPcmBuffer = Buffer.alloc(Math.ceil(maxEndTime * 24000) * 2);

    results.forEach(res => {
      const startSampleOffset = Math.round(res.start * 24000);
      const startByteOffset = startSampleOffset * 2;

      if (startByteOffset < finalPcmBuffer.length) {
        const bytesToWrite = Math.min(res.buffer.length, finalPcmBuffer.length - startByteOffset);
        res.buffer.copy(finalPcmBuffer, startByteOffset, 0, bytesToWrite);
      }
    });

    // Compile into final standard high-quality WAV audio file
    const wavBuffer = encodeWav(finalPcmBuffer, 24000);
    const wavBase64 = wavBuffer.toString("base64");

    return res.json({
      success: true,
      audioBase64: wavBase64,
      mimeType: "audio/wav",
      totalDuration: maxEndTime,
      segments: results.map(r => ({
        index: r.index,
        start: r.start,
        duration: r.duration,
        success: r.success,
        error: r.error
      }))
    });

  } catch (error: any) {
    console.error("[TTS] Endpoint compilation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate synchronized voice track." });
  }
});

// 3. API: Transcode WebM to highly compatible MP4 (H.264 + AAC) using server-side ffmpeg
app.post("/api/transcode", async (req, res) => {
  const tempFiles: string[] = [];
  try {
    const { videoBase64, filename } = req.body;

    if (!videoBase64) {
      return res.status(400).json({ error: "Missing videoBase64 payload" });
    }

    const outputFilename = filename ? filename.replace(/\.[^/.]+$/, "") + ".mp4" : `odia_viral_captions_${Date.now()}.mp4`;
    
    // Create temporary unique file paths
    const randomId = Math.random().toString(36).substring(2, 10);
    const tempInPath = path.join(os.tmpdir(), `input_${randomId}.webm`);
    const tempOutPath = path.join(os.tmpdir(), `output_${randomId}.mp4`);

    tempFiles.push(tempInPath, tempOutPath);

    console.log(`[Transcode] Writing temporary input WebM of size ${(videoBase64.length / (1024 * 1024)).toFixed(2)} MB to ${tempInPath}`);
    const buffer = Buffer.from(videoBase64, "base64");
    await fs.promises.writeFile(tempInPath, buffer);

    console.log(`[Transcode] Transcoding ${tempInPath} -> ${tempOutPath} using FFmpeg...`);
    
    let transcodeSuccess = false;
    let transcodeErrorMsg = "";

    // Attempt 1: Full High-Fidelity MP4 with H.264 video and AAC audio
    // We add "-fflags +genpts" to correct presentation timestamps from Canvas MediaRecorder.
    const ffmpegCmdWithAudio = `ffmpeg -y -fflags +genpts -i "${tempInPath}" -c:v libx264 -preset superfast -crf 21 -pix_fmt yuv420p -map 0:v -map 0:a? -c:a aac -b:a 128k -strict -2 "${tempOutPath}"`;
    
    try {
      console.log(`[Transcode] Attempting transcode with audio: ${ffmpegCmdWithAudio}`);
      await new Promise<void>((resolve, reject) => {
        exec(ffmpegCmdWithAudio, (err, stdout, stderr) => {
          if (err) {
            console.warn("[Transcode] Attempt with audio failed. FFmpeg stderr:", stderr);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      transcodeSuccess = true;
      console.log("[Transcode] FFmpeg transcoding with audio completed successfully!");
    } catch (err: any) {
      transcodeErrorMsg = err.message;
      console.warn(`[Transcode] Full transcode with audio failed, attempting robust fallback without audio (-an)...`);
    }

    // Attempt 2: Fallback to Video-Only H.264 MP4 (handles files where audio is empty or fails to map)
    if (!transcodeSuccess) {
      const ffmpegCmdVideoOnly = `ffmpeg -y -fflags +genpts -i "${tempInPath}" -c:v libx264 -preset superfast -crf 21 -pix_fmt yuv420p -an "${tempOutPath}"`;
      try {
        console.log(`[Transcode] Attempting video-only fallback: ${ffmpegCmdVideoOnly}`);
        await new Promise<void>((resolve, reject) => {
          exec(ffmpegCmdVideoOnly, (err, stdout, stderr) => {
            if (err) {
              console.error("[Transcode] Fallback video-only failed. FFmpeg stderr:", stderr);
              reject(err);
            } else {
              resolve();
            }
          });
        });
        transcodeSuccess = true;
        console.log("[Transcode] Fallback video-only transcoding completed successfully!");
      } catch (err2: any) {
        transcodeErrorMsg += ` | Fallback Error: ${err2.message}`;
        console.error("[Transcode] All transcoding attempts failed.");
      }
    }

    if (!transcodeSuccess) {
      throw new Error(`FFmpeg transcoding failed on all attempts. Errors: ${transcodeErrorMsg}`);
    }

    if (!fs.existsSync(tempOutPath)) {
      throw new Error("Transcoded MP4 file was not created by FFmpeg.");
    }

    const stat = await fs.promises.stat(tempOutPath);
    console.log(`[Transcode] Transcoded MP4 successfully of size ${(stat.size / (1024 * 1024)).toFixed(2)} MB.`);

    // Clean up only the input WebM file immediately as the output MP4 will be streamed by /api/download-video
    try {
      if (fs.existsSync(tempInPath)) {
        fs.unlinkSync(tempInPath);
        console.log(`[Transcode] Cleaned up temporary input file: ${tempInPath}`);
      }
    } catch (e: any) {
      console.warn(`[Transcode] Error cleaning up temporary input file ${tempInPath}:`, e.message);
    }

    res.json({
      success: true,
      downloadUrl: `/api/download-video?id=output_${randomId}.mp4&name=${encodeURIComponent(outputFilename)}`
    });

  } catch (err: any) {
    console.error("[Transcode] Transcode route failed:", err);
    cleanupTempFiles(tempFiles);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to transcode video." });
    }
  }
});

// 3.5 API: Download transcoded MP4 natively via Express res.download (full Range/HTTP resume support)
app.get("/api/download-video", (req, res) => {
  const fileId = req.query.id as string;
  const fileName = req.query.name as string || "video.mp4";

  if (!fileId || typeof fileId !== "string" || fileId.includes("/") || fileId.includes("..")) {
    return res.status(400).send("Invalid file ID.");
  }

  const filePath = path.join(os.tmpdir(), fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Export file has expired or not found. Please click 'Generate & Download' again.");
  }

  try {
    // Clean filename for Content-Disposition (safe characters only)
    let safeFilename = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    if (!safeFilename.toLowerCase().endsWith(".mp4")) {
      safeFilename += ".mp4";
    }

    console.log(`[Download] Starting Express native download for ${fileId} as "${safeFilename}"`);
    res.download(filePath, safeFilename, (err) => {
      if (err) {
        console.error(`[Download] Error during download of ${fileId}:`, err.message);
      } else {
        console.log(`[Download] Finished streaming file ${fileId} to client.`);
      }
    });

  } catch (err: any) {
    console.error("[Download] Endpoint error:", err);
    if (!res.headersSent) {
      res.status(500).send("Failed to download video file.");
    }
  }
});

// 3.6 API: Prepare text files (SRT, TXT, JSON) for download by saving them in temporary storage
app.post("/api/prepare-text-download", (req, res) => {
  try {
    const { content, fileName, mimeType } = req.body;
    if (!content) {
      return res.status(400).json({ error: "File content is empty or missing." });
    }

    const randomId = Math.random().toString(36).substring(2, 15);
    const tempFileId = `text_temp_${randomId}.txt`;
    const tempFilePath = path.join(os.tmpdir(), tempFileId);

    fs.writeFileSync(tempFilePath, content, "utf8");

    console.log(`[TextDownload] Saved temporary text file: ${tempFilePath}`);

    res.json({
      success: true,
      downloadUrl: `/api/download-temp-text?id=${tempFileId}&name=${encodeURIComponent(fileName || "caption.srt")}&mime=${encodeURIComponent(mimeType || "text/plain")}`
    });
  } catch (err: any) {
    console.error("[TextDownload] Prepare error:", err);
    res.status(500).json({ error: "Failed to prepare text download." });
  }
});

// 3.7 API: Download prepared text files via simple GET request (extremely reliable for gallery/file-manager)
app.get("/api/download-temp-text", (req, res) => {
  const fileId = req.query.id as string;
  const fileName = req.query.name as string || "caption.srt";
  const mimeType = req.query.mime as string || "text/plain";

  if (!fileId || typeof fileId !== "string" || fileId.includes("/") || fileId.includes("..") || !fileId.startsWith("text_temp_")) {
    return res.status(400).send("Invalid file ID.");
  }

  const filePath = path.join(os.tmpdir(), fileId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Export file has expired or not found. Please click the download button again.");
  }

  try {
    // Clean filename for safety (allow dots and standard file characters)
    let safeFilename = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

    console.log(`[TextDownload] Starting Express native download for ${fileId} as "${safeFilename}"`);
    res.download(filePath, safeFilename, (err) => {
      if (err) {
        console.error(`[TextDownload] Error during download of ${fileId}:`, err.message);
      } else {
        console.log(`[TextDownload] Finished streaming file ${fileId} to client.`);
      }
    });

  } catch (err: any) {
    console.error("[TextDownload] Endpoint error:", err);
    if (!res.headersSent) {
      res.status(500).send("Failed to stream file.");
    }
  }
});

// 3.8 Background Process: Periodically clean up old temporary and transcoded files
setInterval(() => {
  try {
    const tmpDir = os.tmpdir();
    fs.readdir(tmpDir, (err, files) => {
      if (err) return;
      const now = Date.now();
      const maxAge = 15 * 60 * 1000; // Keep files for 15 minutes before deleting
      files.forEach(file => {
        if (
          file.startsWith("input_") ||
          file.startsWith("output_") ||
          file.startsWith("text_temp_")
        ) {
          const filePath = path.join(tmpDir, file);
          fs.stat(filePath, (statErr, stats) => {
            if (statErr) return;
            if (now - stats.mtimeMs > maxAge) {
              fs.unlink(filePath, (unlinkErr) => {
                if (!unlinkErr) {
                  console.log(`[PeriodicCleanup] Safely deleted expired file: ${file}`);
                }
              });
            }
          });
        }
      });
    });
  } catch (e: any) {
    console.error("[PeriodicCleanup] Error in background loop:", e.message);
  }
}, 5 * 60 * 1000); // Runs every 5 minutes

function cleanupTempFiles(paths: string[]) {
  paths.forEach(p => {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`[Transcode] Cleaned up temporary file: ${p}`);
      }
    } catch (e: any) {
      console.warn(`[Transcode] Error cleaning up temporary file ${p}:`, e.message);
    }
  });
}

// 2. Vite Integration for Frontend Hosting
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Odia Auto Caption Maker] Server active at http://localhost:${PORT}`);
  });
}

startServer();
