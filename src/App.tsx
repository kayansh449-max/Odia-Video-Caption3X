import React, { useState, useRef, useEffect } from "react";
import { Caption, TemplateId, LanguageId, TEMPLATES, CustomStyleSettings } from "./types";
import { extractAudioFromVideo } from "./utils/audioExtractor";
import { captionsToSRT, captionsToTXT, captionsToJSON, downloadFile } from "./utils/captionExporter";
import VideoExporter from "./components/VideoExporter";
import { getEmojiForText } from "./utils/canvasRenderer";
import { loadAndRegisterAllCustomFonts, saveFont } from "./utils/fontStorage";
import {
  Upload,
  Sparkles,
  Play,
  Pause,
  Plus,
  Trash2,
  Download as DownloadIcon,
  ChevronRight,
  RefreshCw,
  Video,
  Languages,
  LayoutTemplate,
  Edit3,
  Flame,
  FileText,
  Volume2,
  Info,
  Smartphone,
  Info as InfoIcon,
  CheckCircle,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  X,
  Home,
  Sliders,
} from "lucide-react";

const VOICE_CATEGORIES = [
  "Male Child",
  "Young Boy",
  "Young Man",
  "Father",
  "Elder Man / Grandfather",
  "Female Child",
  "Young Girl",
  "Young Woman",
  "Mother",
  "Elder Woman / Grandmother"
];

const VOICE_STYLES = [
  { id: "Default", label: "Natural", labelHindi: "प्राकृतिक", emoji: "🎙️" },
  { id: "Happy", label: "Happy / Excited", labelHindi: "खुश / उत्साहित", emoji: "😊" },
  { id: "Sad", label: "Sad / Crying", labelHindi: "दुखी / रोना", emoji: "😢" },
  { id: "Suspense", label: "Suspense / Mystery", labelHindi: "सस्पेंस / रहस्यमय", emoji: "🤫" },
  { id: "Angry", label: "Angry / Serious", labelHindi: "क्रोधित / गंभीर", emoji: "😠" },
  { id: "Whispering", label: "Whisper / Soft", labelHindi: "धीमा / कोमल", emoji: "🍃" }
];

const VOICE_MAPPING_CLIENT: Record<string, { voiceName: string, promptCue: string }> = {
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

const STYLE_PROMPTS_CLIENT: Record<string, string> = {
  "Default": "Speak in a natural, neutral, clear narration tone of voice.",
  "Happy": "Speak with extremely high energy, happiness, excitement, cheerful laughter, and a bright smile in the voice.",
  "Sad": "Speak in a deeply emotional, crying, weeping, soft, trembling, sad, grieving and heartbroken voice.",
  "Suspense": "Speak in a quiet, whispering, highly mysterious, thriller, tense, intense, dark, suspenseful and dramatic tone of voice.",
  "Angry": "Speak with an aggressive, loud, angry, extremely serious, firm, commanding, authoritative and hostile tone of voice.",
  "Whispering": "Speak in an extremely quiet, soft, whispering, gentle, peaceful, low-volume and calm tone of voice."
};

function tryManualJsonParseClientSide(text: string): any[] {
  const list: any[] = [];
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
    } catch (err) {}
  }

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

function encodeWavClientSide(pcmUint8: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels = 1; // mono
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmUint8.length;
  const chunkSize = 36 + dataSize;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, chunkSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const result = new Uint8Array(44 + dataSize);
  result.set(new Uint8Array(header), 0);
  result.set(pcmUint8, 44);

  return result;
}

async function transcribeAudioClientSide(
  audioBase64: string,
  language: string,
  duration: number,
  key: string
): Promise<any[]> {
  const targetLang = language || "Odia";
  const durationText = (duration && !isNaN(duration))
    ? `The total duration of the provided audio file is exactly ${duration.toFixed(2)} seconds. You MUST strictly calibrate and synchronize all start and end timestamps within this 0.0 to ${duration.toFixed(2)} seconds timeline.`
    : "";

  const promptText = `You are an ultra-precise speech transcription and timing alignment engine.
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
6. Return the result strictly conforming to the JSON Schema.`;

  const models = ["gemini-1.5-flash", "gemini-2.5-flash"];
  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: audioBase64
                  }
                },
                {
                  text: promptText
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              description: "An array of subtitles with start/end times and captions",
              items: {
                type: "OBJECT",
                properties: {
                  text: { type: "STRING" },
                  start: { type: "NUMBER" },
                  end: { type: "NUMBER" }
                },
                required: ["text", "start", "end"]
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResult) {
        throw new Error("No transcription text returned from Gemini.");
      }

      let parsed;
      try {
        parsed = JSON.parse(textResult.trim());
      } catch (err) {
        parsed = tryManualJsonParseClientSide(textResult);
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (err: any) {
      console.warn(`Direct transcription with ${model} failed, trying next...`, err);
      lastError = err;
    }
  }

  throw lastError || new Error("Transcription failed on Google API client side.");
}

async function synthesizeSpeechClientSide(
  captions: any[],
  voiceAssignments: any,
  defaultVoice: string,
  selectedVoiceStyle: string,
  selectedLanguage: string,
  key: string
): Promise<{ success: boolean; audioBase64: string; totalDuration: number }> {
  const getVoiceConfig = (caption: any) => {
    let voiceCategory = defaultVoice || "Young Woman";
    if (caption.character && voiceAssignments && voiceAssignments[caption.character]) {
      voiceCategory = voiceAssignments[caption.character];
    }
    return VOICE_MAPPING_CLIENT[voiceCategory] || VOICE_MAPPING_CLIENT["Young Woman"];
  };

  const targetLang = selectedLanguage || "Odia";

  const synthesisPromises = captions.map(async (caption: any, index: number) => {
    let cleanText = caption.text;
    const colonIndex = cleanText.indexOf(":");
    if (colonIndex !== -1 && colonIndex < 15) {
      cleanText = cleanText.substring(colonIndex + 1).trim();
    }

    const voiceConf = getVoiceConfig(caption);
    const currentStyle = caption.style || selectedVoiceStyle || "Default";
    const styleInstruction = STYLE_PROMPTS_CLIENT[currentStyle] || STYLE_PROMPTS_CLIENT["Default"];

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
      const model = "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptPart }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceConf.voiceName }
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google TTS API returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("Empty audio track returned from Google Gemini TTS API.");
      }

      const binaryString = atob(base64Audio);
      const buffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        buffer[i] = binaryString.charCodeAt(i);
      }

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
      console.error(`[TTS Client side] [Segment ${index}] Failed:`, err);
      const duration = Math.max(0.5, parseFloat(caption.end) - parseFloat(caption.start));
      const silenceBuffer = new Uint8Array(Math.ceil(duration * 24000) * 2);
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

  let maxEndTime = 0;
  results.forEach(res => {
    const endPos = res.start + res.duration;
    if (endPos > maxEndTime) {
      maxEndTime = endPos;
    }
  });

  if (maxEndTime <= 0) maxEndTime = 5;

  const finalPcmBuffer = new Uint8Array(Math.ceil(maxEndTime * 24000) * 2);

  results.forEach(res => {
    const startSampleOffset = Math.round(res.start * 24000);
    const startByteOffset = startSampleOffset * 2;

    if (startByteOffset < finalPcmBuffer.length) {
      const bytesToWrite = Math.min(res.buffer.length, finalPcmBuffer.length - startByteOffset);
      finalPcmBuffer.set(res.buffer.subarray(0, bytesToWrite), startByteOffset);
    }
  });

  const wavUint8 = encodeWavClientSide(finalPcmBuffer, 24000);

  let binary = "";
  const len = wavUint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(wavUint8[i]);
  }
  const base64Wav = btoa(binary);

  return {
    success: true,
    audioBase64: base64Wav,
    totalDuration: maxEndTime
  };
}

export default function App() {
  // App States
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState<"idle" | "extracting" | "transcribing">("idle");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  
  // Custom Aspect Ratio & Dimensions states
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:5" | "original">("original");
  const [videoWidth, setVideoWidth] = useState<number>(720);
  const [videoHeight, setVideoHeight] = useState<number>(1280);
  
  // Transcription Settings
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageId>("Odia");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("viral-shorts");
  const [captions, setCaptions] = useState<Caption[]>([]);

  // Draggable Caption States
  const [captionX, setCaptionX] = useState<number>(50); // percentage 0-100
  const [captionY, setCaptionY] = useState<number>(75); // percentage 0-100
  const [captionScale, setCaptionScale] = useState<number>(1.0); // 0.5 - 2.5
  const [captionBgOpacity, setCaptionBgOpacity] = useState<number>(90); // background opacity 0-100%
  const [languageClicked, setLanguageClicked] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // AI Voiceover Generation States
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedVoiceUrl, setSynthesizedVoiceUrl] = useState<string>("");
  const [synthesizedVoiceBlob, setSynthesizedVoiceBlob] = useState<Blob | null>(null);
  const [voiceAssignments, setVoiceAssignments] = useState<Record<string, string>>({});
  const [defaultVoice, setDefaultVoice] = useState<string>("Young Woman");
  const [voiceSynthesisError, setVoiceSynthesisError] = useState<string | null>(null);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [isExportingMp3, setIsExportingMp3] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Single Caption Voice Generation States
  const [loadingSingleIndices, setLoadingSingleIndices] = useState<Record<number, boolean>>({});
  const [singleCaptionVoiceUrls, setSingleCaptionVoiceUrls] = useState<Record<number, string>>({});
  const [singlePlayingIndices, setSinglePlayingIndices] = useState<Record<number, boolean>>({});
  const singleAudioPlayersRef = useRef<Record<number, HTMLAudioElement>>({});

  // Standalone Text-to-Speech States
  const [standaloneText, setStandaloneText] = useState<string>("");
  const [isSynthesizingStandalone, setIsSynthesizingStandalone] = useState(false);
  const [standaloneVoiceUrl, setStandaloneVoiceUrl] = useState<string>("");
  const [standaloneVoiceBlob, setStandaloneVoiceBlob] = useState<Blob | null>(null);
  const [isPlayingStandalone, setIsPlayingStandalone] = useState(false);
  const [standaloneVoice, setStandaloneVoice] = useState<string>("Young Woman");
  const [standaloneError, setStandaloneError] = useState<string | null>(null);
  const [activeVoiceTab, setActiveVoiceTab] = useState<"standalone" | "sync">("standalone");
  const [selectedVoiceStyle, setSelectedVoiceStyle] = useState<string>("Default");
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);

  // Subtitle Custom Settings & Animation state
  const [customStyleSettings, setCustomStyleSettings] = useState<CustomStyleSettings>({
    fontFamily: "Noto Sans Odia",
    fontSize: 26,
    fontWeight: "900",
    fontColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 5,
    shadowColor: "rgba(0,0,0,0.85)",
    shadowBlur: 5,
    hasBackgroundBox: false,
    backgroundBoxColor: "#000000",
    backgroundOpacity: 60,
    lineSpacing: 1.25,
    letterSpacing: 0,
    textAlignment: "center",
    bottomMargin: 85,
    safeAreaEnabled: true,
    animationStyle: "Popping Words",
    animationSpeed: 1.0,
    animationDuration: 1.0,
    animationIntensity: 5,
  });

  const [uploadedFonts, setUploadedFonts] = useState<string[]>([]);
  const [globalTimeOffset, setGlobalTimeOffset] = useState<number>(-0.15); // Default timing calibration

  // Fetch custom fonts from IndexedDB on startup
  useEffect(() => {
    async function initFonts() {
      try {
        const loaded = await loadAndRegisterAllCustomFonts();
        setUploadedFonts(loaded.map((f) => f.name));
      } catch (err) {
        console.error("IndexedDB custom font loading error:", err);
      }
    }
    initFonts();
  }, []);

  const handleLocalFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "ttf" && extension !== "otf") {
      alert("Please upload a valid TrueType (.ttf) or OpenType (.otf) font file.");
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Generate clean font name
      const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      
      // Save to IndexedDB
      await saveFont({
        id: fontName,
        name: fontName,
        fileName: file.name,
        data: arrayBuffer,
        format: extension as "ttf" | "otf"
      });
      
      // Dynamically load font face in DOM so it's instantly active!
      const fontFace = new FontFace(fontName, arrayBuffer);
      await fontFace.load();
      document.fonts.add(fontFace);

      setUploadedFonts(prev => [...prev, fontName]);
      setCustomStyleSettings(prev => ({ ...prev, fontFamily: fontName }));
    } catch (err: any) {
      console.error("Local font upload failed:", err);
      alert(`Font loading failed: ${err.message || err}`);
    }
  };

  const applyTemplatePreset = (tmplId: TemplateId) => {
    setSelectedTemplate(tmplId);
    
    // Map template defaults
    const defaults: Record<TemplateId, Partial<CustomStyleSettings>> = {
      'simple-white': {
        fontFamily: "Inter",
        fontSize: 24,
        fontWeight: "600",
        fontColor: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 0,
        shadowColor: "rgba(0,0,0,0.8)",
        shadowBlur: 4,
        hasBackgroundBox: true,
        backgroundBoxColor: "#000000",
        backgroundOpacity: 55,
        lineSpacing: 1.2,
        letterSpacing: 0,
        textAlignment: "center",
        bottomMargin: 80,
        safeAreaEnabled: false,
        animationStyle: "None",
      },
      'viral-shorts': {
        fontFamily: "JetBrains Mono",
        fontSize: 30,
        fontWeight: "900",
        fontColor: "#facc15",
        outlineColor: "#000000",
        outlineWidth: 6,
        shadowColor: "rgba(0,0,0,1)",
        shadowBlur: 6,
        hasBackgroundBox: true,
        backgroundBoxColor: "#000000",
        backgroundOpacity: 100,
        lineSpacing: 1.3,
        letterSpacing: -1,
        textAlignment: "center",
        bottomMargin: 80,
        safeAreaEnabled: true,
        animationStyle: "Popping Words",
      },
      'mrbeast-style': {
        fontFamily: "Space Grotesk",
        fontSize: 34,
        fontWeight: "900",
        fontColor: "#ffffff",
        outlineColor: "#000500",
        outlineWidth: 8,
        shadowColor: "rgba(0,0,0,1)",
        shadowBlur: 8,
        hasBackgroundBox: true,
        backgroundBoxColor: "#f59e0b",
        backgroundOpacity: 100,
        lineSpacing: 1.4,
        letterSpacing: -1,
        textAlignment: "center",
        bottomMargin: 100,
        safeAreaEnabled: true,
        animationStyle: "Popping Word by Word",
      },
      'emotional-story': {
        fontFamily: "Playfair Display",
        fontSize: 22,
        fontWeight: "500",
        fontColor: "#fef3c7",
        outlineColor: "#000000",
        outlineWidth: 0,
        shadowColor: "rgba(253, 246, 227, 0.4)",
        shadowBlur: 8,
        hasBackgroundBox: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        textAlignment: "center",
        bottomMargin: 70,
        safeAreaEnabled: false,
        animationStyle: "Fade In",
      },
      'reels-trending': {
        fontFamily: "Outfit",
        fontSize: 26,
        fontWeight: "800",
        fontColor: "#67e8f9",
        outlineColor: "#22d3ee",
        outlineWidth: 2,
        shadowColor: "rgba(34, 211, 238, 0.6)",
        shadowBlur: 12,
        hasBackgroundBox: true,
        backgroundBoxColor: "#020617",
        backgroundOpacity: 85,
        lineSpacing: 1.2,
        letterSpacing: 2,
        textAlignment: "center",
        bottomMargin: 90,
        safeAreaEnabled: true,
        animationStyle: "Zoom",
      },
      'viral-highlights': {
        fontFamily: "Outfit",
        fontSize: 32,
        fontWeight: "900",
        fontColor: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 6,
        shadowColor: "rgba(0,0,0,0.8)",
        shadowBlur: 6,
        hasBackgroundBox: true,
        backgroundBoxColor: "#09090b",
        backgroundOpacity: 90,
        lineSpacing: 1.3,
        letterSpacing: -1,
        textAlignment: "center",
        bottomMargin: 80,
        safeAreaEnabled: true,
        animationStyle: "Active Word",
      },
      'emoji-fusion': {
        fontFamily: "Noto Sans Odia",
        fontSize: 24,
        fontWeight: "800",
        fontColor: "#fef08a",
        outlineColor: "#ec4899",
        outlineWidth: 2.5,
        shadowColor: "rgba(236, 72, 153, 0.5)",
        shadowBlur: 16,
        hasBackgroundBox: true,
        backgroundBoxColor: "#0f0c1e",
        backgroundOpacity: 90,
        lineSpacing: 1.2,
        letterSpacing: 1,
        textAlignment: "center",
        bottomMargin: 80,
        safeAreaEnabled: false,
        animationStyle: "None",
      },
      'karaoke-pro': {
        fontFamily: "Outfit",
        fontSize: 25,
        fontWeight: "900",
        fontColor: "#ffffff",
        outlineColor: "#000000",
        outlineWidth: 5,
        shadowColor: "rgba(16, 185, 129, 0.6)",
        shadowBlur: 8,
        hasBackgroundBox: true,
        backgroundBoxColor: "#0a0a0f",
        backgroundOpacity: 88,
        lineSpacing: 1.2,
        letterSpacing: 0,
        textAlignment: "center",
        bottomMargin: 80,
        safeAreaEnabled: true,
        animationStyle: "Active Word Zoom",
      }
    };

    const selDefaults = defaults[tmplId];
    if (selDefaults) {
      setCustomStyleSettings(prev => ({
        ...prev,
        ...selDefaults,
      }));
    }
  };

  const renderCustomCaptionHTML = (
    text: string,
    settings: CustomStyleSettings,
    currTime: number,
    start: number,
    end: number
  ) => {
    const elapsed = currTime - start;
    const duration = end - start || 1;
    const animType = settings.animationStyle.toLowerCase();
    const animSpeed = settings.animationSpeed || 1.0;
    const animIntensity = settings.animationIntensity || 5;

    // Split words
    const words = text.split(/\s+/);
    const lineLimit = 6;
    const useTwoLines = words.length > lineLimit;
    const line1Words = useTwoLines ? words.slice(0, Math.ceil(words.length / 2)) : words;
    const line2Words = useTwoLines ? words.slice(Math.ceil(words.length / 2)) : [];

    // Global transitions
    let opacity = 1.0;
    let transform = "";

    if (animType === "fade in") {
      const fadeDuration = 0.3 * (settings.animationDuration || 1.0) / animSpeed;
      opacity = Math.max(0.0, Math.min(1.0, elapsed / fadeDuration));
    } else if (animType === "fade out") {
      const fadeOutDuration = 0.3 * (settings.animationDuration || 1.0) / animSpeed;
      const remaining = end - currTime;
      opacity = Math.max(0.0, Math.min(1.0, remaining / fadeOutDuration));
    } else if (animType === "zoom") {
      const progress = Math.max(0.0, Math.min(1.0, elapsed / duration));
      const scale = 1.0 + progress * 0.25 * (animIntensity / 5) * animSpeed;
      transform = `scale(${scale})`;
    } else if (animType === "shake") {
      const tx = (Math.random() - 0.5) * animIntensity;
      const ty = (Math.random() - 0.5) * animIntensity;
      transform = `translate(${tx}px, ${ty}px)`;
    }

    // Spacing, color, font-family, outline, shadow styles
    const textStyle: React.CSSProperties = {
      fontFamily: `"${settings.fontFamily}", sans-serif`,
      fontSize: `${settings.fontSize}px`,
      fontWeight: settings.fontWeight,
      color: settings.fontColor,
      textAlign: settings.textAlignment,
      letterSpacing: `${settings.letterSpacing}px`,
      lineHeight: settings.lineSpacing,
      textShadow: settings.shadowBlur > 0 
        ? `2px 2px ${settings.shadowBlur}px ${settings.shadowColor}` 
        : "none",
      WebkitTextStroke: settings.outlineWidth > 0 
        ? `${settings.outlineWidth}px ${settings.outlineColor}` 
        : "none",
      whiteSpace: "nowrap",
    };

    const containerStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      alignItems: settings.textAlignment === "center" ? "center" : settings.textAlignment === "right" ? "flex-end" : "flex-start",
      justifyContent: "center",
      backgroundColor: settings.hasBackgroundBox 
        ? `rgba(${hexToRgb(settings.backgroundBoxColor)}, ${settings.backgroundOpacity / 100})` 
        : "transparent",
      borderRadius: "12px",
      padding: "8px 16px",
      opacity: opacity,
      transform: transform,
    };

    // Helper to get RGB of hex
    function hexToRgb(hex: string) {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
      return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "0, 0, 0";
    }

    const isWordAnim = ["word by word", "popping word by word", "active word", "active word zoom", "popping words"].includes(animType);

    const renderLineHTML = (lineWords: string[], wordStartIndex: number, lineIndex: number) => {
      if (isWordAnim) {
        const totalDuration = duration;
        const wordDuration = totalDuration / Math.max(1, words.length);
        const currentWordIndex = Math.min(
          words.length - 1,
          Math.max(0, Math.floor(elapsed / wordDuration))
        );

        return (
          <span className="flex flex-nowrap whitespace-nowrap gap-x-1.5 justify-center">
            {lineWords.map((word, idx) => {
              const globalIdx = wordStartIndex + idx;
              const isActive = globalIdx === currentWordIndex;
              const hasBeenSpoken = globalIdx <= currentWordIndex;

              let wordScale = 1.0;
              let wordAlpha = 1.0;
              let wordColor = settings.fontColor;

              if (animType === "word by word") {
                if (!hasBeenSpoken) wordAlpha = 0.0;
              } else if (animType === "popping word by word") {
                if (isActive) {
                  const wordElapsed = elapsed - (globalIdx * wordDuration);
                  wordScale = 1.0 + Math.sin(Math.max(0.0, Math.min(Math.PI, (wordElapsed / wordDuration) * Math.PI))) * 0.3 * (animIntensity / 5);
                  wordColor = "#22c55e"; // bright green
                }
              } else if (animType === "active word") {
                if (isActive) {
                  wordColor = "#facc15"; // yellow
                } else {
                  wordColor = "rgba(255,255,255,0.45)";
                }
              } else if (animType === "active word zoom") {
                if (isActive) {
                  const wordElapsed = elapsed - (globalIdx * wordDuration);
                  wordScale = 1.1 + Math.sin(Math.max(0.0, Math.min(Math.PI, (wordElapsed / wordDuration) * Math.PI))) * 0.2;
                  wordColor = "#facc15";
                } else {
                  wordScale = 0.9;
                  wordColor = "rgba(255,255,255,0.45)";
                }
              } else if (animType === "popping words") {
                if (hasBeenSpoken) {
                  const wordElapsed = elapsed - (globalIdx * wordDuration);
                  wordScale = Math.max(0.0, Math.min(1.0, wordElapsed / (0.15 / animSpeed))) * 1.1;
                  if (isActive) wordScale = 1.25;
                } else {
                  wordAlpha = 0.0;
                }
              }

              return (
                <span
                  key={idx}
                  style={{
                    transform: `scale(${wordScale})`,
                    opacity: wordAlpha,
                    color: wordColor,
                    display: "inline-block",
                  }}
                  className="transition-transform duration-75"
                >
                  {word}
                </span>
              );
            })}
          </span>
        );
      }

      // Letter-by-letter typing effect
      if (animType === "letter by letter") {
        const totalChars = text.length;
        const visibleCount = Math.floor(totalChars * Math.min(1.0, (elapsed / (duration * 0.8)) * animSpeed));
        const lineStr = lineWords.join(" ");

        const lineStartIndex = wordStartIndex === 0 ? 0 : (line1Words.join(" ").length + 1);
        const charactersInLine = lineStr.length;
        const lineEndIndex = lineStartIndex + charactersInLine;

        let renderStr = "";
        if (visibleCount >= lineStartIndex) {
          renderStr = lineStr.substring(0, Math.min(charactersInLine, visibleCount - lineStartIndex));
        }

        return <span>{renderStr}</span>;
      }

      // Default full line draw
      return <span>{lineWords.join(" ")}</span>;
    };

    // Evaluate line animations (e.g. falling, expanding, popping lines)
    let line1Style: React.CSSProperties = { display: "inline-block", whiteSpace: "nowrap" };
    let line2Style: React.CSSProperties = { display: "inline-block", whiteSpace: "nowrap" };

    if (animType === "popping lines" || animType === "line by line") {
      const lineDuration = duration / 2;
      if (elapsed < lineDuration) {
        line2Style = { display: "none" };
        if (animType === "popping lines") {
          const t = elapsed / lineDuration;
          const s = 1.0 + Math.sin(Math.min(Math.PI, t * Math.PI)) * 0.15 * (animIntensity / 5);
          line1Style = { transform: `scale(${s})`, display: "inline-block" };
        }
      } else {
        if (animType === "popping lines") {
          const t = (elapsed - lineDuration) / lineDuration;
          const s = 1.0 + Math.sin(Math.min(Math.PI, t * Math.PI)) * 0.15 * (animIntensity / 5);
          line2Style = { transform: `scale(${s})`, display: "inline-block" };
        }
      }
    } else if (animType === "expanding lines") {
      const s1 = Math.min(1.0, elapsed / (0.25 / animSpeed));
      const s2 = Math.min(1.0, Math.max(0.0, elapsed - 0.25) / (0.25 / animSpeed));
      line1Style = { transform: `scaleX(${s1})`, display: "inline-block", transformOrigin: "center" };
      line2Style = { transform: `scaleX(${s2})`, display: "inline-block", transformOrigin: "center" };
    } else if (animType === "falling lines") {
      const t1 = Math.min(1.0, elapsed / (0.4 / animSpeed));
      const t2 = Math.min(1.0, Math.max(0.0, elapsed - 0.25) / (0.4 / animSpeed));
      const off1 = (1.0 - Math.sin(t1 * Math.PI / 2)) * -30 * (animIntensity / 5);
      const off2 = (1.0 - Math.sin(t2 * Math.PI / 2)) * -30 * (animIntensity / 5);
      line1Style = { transform: `translateY(${off1}px)`, display: "inline-block" };
      line2Style = { transform: `translateY(${off2}px)`, display: "inline-block" };
    }

    return (
      <div style={containerStyle}>
        <div style={textStyle}>
          {useTwoLines ? (
            <div className="flex flex-col gap-1">
              <div style={line1Style}>{renderLineHTML(line1Words, 0, 1)}</div>
              <div style={line2Style}>{renderLineHTML(line2Words, line1Words.length, 2)}</div>
            </div>
          ) : (
            <div style={line1Style}>{renderLineHTML(line1Words, 0, 1)}</div>
          )}
        </div>
      </div>
    );
  };

  const [appTheme, setAppTheme] = useState<"indigo" | "pink" | "amber" | "emerald" | "slate">(() => {
    return (localStorage.getItem("app_theme") as any) || "indigo";
  });

  const changeTheme = (newTheme: "indigo" | "pink" | "amber" | "emerald" | "slate") => {
    setAppTheme(newTheme);
    localStorage.setItem("app_theme", newTheme);
  };

  const themeColors = {
    indigo: {
      text: "text-indigo-400",
      bg: "bg-indigo-600",
      hoverBg: "hover:bg-indigo-700",
      border: "border-indigo-500",
      shadow: "shadow-indigo-500/20",
      glow: "shadow-indigo-500/5",
      badge: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
      gradient: "from-indigo-600 to-pink-600",
      hoverBorder: "hover:border-indigo-500/40",
      hoverShadow: "hover:shadow-indigo-500/5",
      iconBg: "bg-indigo-600/10 border-indigo-500/20",
      groupHoverText: "group-hover:text-indigo-400",
      focusBorder: "focus:border-indigo-500",
      focusRing: "focus:ring-indigo-500/20",
    },
    pink: {
      text: "text-pink-400",
      bg: "bg-pink-600",
      hoverBg: "hover:bg-pink-700",
      border: "border-pink-500",
      shadow: "shadow-pink-500/20",
      glow: "shadow-pink-500/5",
      badge: "bg-pink-500/10 border-pink-500/20 text-pink-400",
      gradient: "from-pink-600 to-purple-600",
      hoverBorder: "hover:border-pink-500/40",
      hoverShadow: "hover:shadow-pink-500/5",
      iconBg: "bg-pink-600/10 border-pink-500/20",
      groupHoverText: "group-hover:text-pink-400",
      focusBorder: "focus:border-pink-500",
      focusRing: "focus:ring-pink-500/20",
    },
    amber: {
      text: "text-amber-400",
      bg: "bg-amber-600",
      hoverBg: "hover:bg-amber-700",
      border: "border-amber-500",
      shadow: "shadow-amber-500/20",
      glow: "shadow-amber-500/5",
      badge: "bg-amber-500/10 border-amber-500/20 text-amber-400",
      gradient: "from-amber-600 to-red-600",
      hoverBorder: "hover:border-amber-500/40",
      hoverShadow: "hover:shadow-amber-500/5",
      iconBg: "bg-amber-600/10 border-amber-500/20",
      groupHoverText: "group-hover:text-amber-400",
      focusBorder: "focus:border-amber-500",
      focusRing: "focus:ring-amber-500/20",
    },
    emerald: {
      text: "text-emerald-400",
      bg: "bg-emerald-600",
      hoverBg: "hover:bg-emerald-700",
      border: "border-emerald-500",
      shadow: "shadow-emerald-500/20",
      glow: "shadow-emerald-500/5",
      badge: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      gradient: "from-emerald-600 to-teal-600",
      hoverBorder: "hover:border-emerald-500/40",
      hoverShadow: "hover:shadow-emerald-500/5",
      iconBg: "bg-emerald-600/10 border-emerald-500/20",
      groupHoverText: "group-hover:text-emerald-400",
      focusBorder: "focus:border-emerald-500",
      focusRing: "focus:ring-emerald-500/20",
    },
    slate: {
      text: "text-slate-300",
      bg: "bg-slate-600",
      hoverBg: "hover:bg-slate-700",
      border: "border-slate-500",
      shadow: "shadow-slate-500/20",
      glow: "shadow-slate-500/5",
      badge: "bg-slate-500/10 border-slate-500/20 text-slate-300",
      gradient: "from-slate-600 to-slate-800",
      hoverBorder: "hover:border-slate-500/40",
      hoverShadow: "hover:shadow-slate-500/5",
      iconBg: "bg-slate-600/10 border-slate-500/20",
      groupHoverText: "group-hover:text-slate-200",
      focusBorder: "focus:border-slate-500",
      focusRing: "focus:ring-slate-500/20",
    },
  }[appTheme];

  const [activeWorkspace, setActiveWorkspace] = useState<"caption" | "voice" | null>(null);
  const standaloneAudioRef = useRef<HTMLAudioElement | null>(null);

  // Parse and detect unique character prefixes in captions (e.g., "Arjun: ନମସ୍କାର" -> "Arjun")
  const detectedCharacters = React.useMemo(() => {
    const charactersSet = new Set<string>();
    captions.forEach(cap => {
      const text = cap.text.trim();
      const colonIdx = text.indexOf(":");
      if (colonIdx > 0 && colonIdx < 15) {
        const name = text.substring(0, colonIdx).trim();
        if (name) {
          charactersSet.add(name);
        }
      }
    });
    return Array.from(charactersSet);
  }, [captions]);

  // Automatically assign matching voice profiles to newly detected characters
  useEffect(() => {
    const newAssignments = { ...voiceAssignments };
    let changed = false;
    detectedCharacters.forEach(char => {
      if (!newAssignments[char]) {
        const lowerChar = char.toLowerCase();
        if (lowerChar.includes("mother") || lowerChar.includes("mom") || lowerChar.includes("ମା") || lowerChar.includes("मां")) {
          newAssignments[char] = "Mother";
        } else if (lowerChar.includes("father") || lowerChar.includes("dad") || lowerChar.includes("ବାପା") || lowerChar.includes("पिता")) {
          newAssignments[char] = "Father";
        } else if (lowerChar.includes("grandfather") || lowerChar.includes("grandpa") || lowerChar.includes("ଜେଜେବାପା") || lowerChar.includes("दादा")) {
          newAssignments[char] = "Elder Man / Grandfather";
        } else if (lowerChar.includes("grandmother") || lowerChar.includes("grandma") || lowerChar.includes("ଜେଜେମା") || lowerChar.includes("दादी")) {
          newAssignments[char] = "Elder Woman / Grandmother";
        } else if (lowerChar.includes("boy") || lowerChar.includes("arjun") || lowerChar.includes("ପୁଅ") || lowerChar.includes("लड़का")) {
          newAssignments[char] = "Young Boy";
        } else if (lowerChar.includes("girl") || lowerChar.includes("ଝିଅ") || lowerChar.includes("लड़की")) {
          newAssignments[char] = "Young Girl";
        } else if (lowerChar.includes("child") || lowerChar.includes("kid") || lowerChar.includes("ଛୁଆ") || lowerChar.includes("बच्चा")) {
          newAssignments[char] = "Male Child";
        } else if (lowerChar.includes("man") || lowerChar.includes("sir") || lowerChar.includes("ଭାଇ") || lowerChar.includes("पुरुष")) {
          newAssignments[char] = "Young Man";
        } else {
          newAssignments[char] = "Young Woman";
        }
        changed = true;
      }
    });
    if (changed) {
      setVoiceAssignments(newAssignments);
    }
  }, [detectedCharacters]);

  // Maintain clean player state when audio elements finish speaking
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = () => {
        setIsPlayingVoice(false);
      };
    }
  }, [synthesizedVoiceUrl]);

  useEffect(() => {
    if (standaloneAudioRef.current) {
      standaloneAudioRef.current.onended = () => {
        setIsPlayingStandalone(false);
      };
    }
  }, [standaloneVoiceUrl]);

  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Update Y coordinate when changing templates to put them at their native spot
  useEffect(() => {
    if (selectedTemplate === "mrbeast-style") {
      setCaptionY(35);
    } else if (selectedTemplate === "simple-white") {
      setCaptionY(85);
    } else if (selectedTemplate === "emotional-story") {
      setCaptionY(80);
    } else if (selectedTemplate === "reels-trending") {
      setCaptionY(82);
    } else {
      setCaptionY(75);
    }
  }, [selectedTemplate]);

  // Handle Drag Pointer Events
  const handleCaptionPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playerContainerRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handleCaptionPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !playerContainerRef.current) return;
    const rect = playerContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCaptionX(Math.max(5, Math.min(95, parseFloat(x.toFixed(1)))));
    setCaptionY(Math.max(5, Math.min(95, parseFloat(y.toFixed(1)))));
  };

  const handleCaptionPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  // Live HTML highlight representation
  const renderCaptionTextHTML = (text: string, templateId: TemplateId) => {
    const words = text.split(/\s+/).filter(Boolean);
    const splitLimit = 6;
    const useTwoLines = words.length > splitLimit;
    const line1Words = useTwoLines ? words.slice(0, Math.ceil(words.length / 2)) : words;
    const line2Words = useTwoLines ? words.slice(Math.ceil(words.length / 2)) : [];

    const line1Text = line1Words.join(" ");
    const line2Text = line2Words.join(" ");

    if (templateId === "emoji-fusion") {
      const emoji = getEmojiForText(text);
      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center">
          {useTwoLines ? (
            <>
              <span className="whitespace-nowrap">{line1Text}</span>
              <span className="whitespace-nowrap flex items-center gap-1.5 justify-center">
                {line2Text} <span className="text-xl md:text-2xl animate-bounce inline-block">{emoji}</span>
              </span>
            </>
          ) : (
            <span className="whitespace-nowrap flex items-center gap-1.5 justify-center">
              {line1Text} <span className="text-xl md:text-2xl animate-bounce inline-block">{emoji}</span>
            </span>
          )}
        </span>
      );
    }

    if (templateId === "karaoke-pro") {
      const activeCaption = captions.find(c => currentTime >= c.start && currentTime <= c.end);
      let activeWordIndex = -1;
      if (activeCaption) {
        const totalDuration = (activeCaption.end - activeCaption.start) || 2.5;
        const elapsed = currentTime - activeCaption.start;
        const wordDuration = totalDuration / Math.max(1, words.length);
        activeWordIndex = Math.min(
          words.length - 1,
          Math.max(0, Math.floor(elapsed / wordDuration))
        );
      }

      const renderKaraokeLine = (lineWordsList: string[], wordStartIndex: number) => (
        <span className="flex flex-nowrap whitespace-nowrap justify-center gap-x-1.5 leading-tight">
          {lineWordsList.map((word, idx) => {
            const originalIndex = wordStartIndex + idx;
            const isActive = originalIndex === activeWordIndex;
            return (
              <span 
                key={idx} 
                className={`transition-all duration-150 inline-block ${
                  isActive 
                    ? "text-emerald-400 font-extrabold scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                    : "text-white/50"
                }`}
              >
                {word}
              </span>
            );
          })}
        </span>
      );

      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center">
          {useTwoLines ? (
            <>
              {renderKaraokeLine(line1Words, 0)}
              {renderKaraokeLine(line2Words, line1Words.length)}
            </>
          ) : (
            renderKaraokeLine(line1Words, 0)
          )}
        </span>
      );
    }

    if (templateId === "viral-highlights") {
      const globalWords = (line1Text + " " + line2Text).trim().split(/\s+/).filter(Boolean);
      const longestWord = [...globalWords].sort((a, b) => b.length - a.length)[0];

      const renderHighlightLine = (lineWordsList: string[]) => (
        <span className="flex flex-nowrap whitespace-nowrap justify-center gap-x-1.5 leading-tight">
          {lineWordsList.map((word, idx) => {
            const isHighlighted = word === longestWord && globalWords.length > 1;
            let colorClass = "text-white";
            if (isHighlighted) colorClass = "text-green-400 font-extrabold scale-105 inline-block";
            else if (idx % 2 === 0) colorClass = "text-white";
            else colorClass = "text-pink-500 font-semibold";
            return <span key={idx} className={colorClass}>{word}</span>;
          })}
        </span>
      );

      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center">
          {useTwoLines ? (
            <>
              {renderHighlightLine(line1Words)}
              {renderHighlightLine(line2Words)}
            </>
          ) : (
            renderHighlightLine(line1Words)
          )}
        </span>
      );
    }

    if (templateId === "mrbeast-style") {
      const globalWords = (line1Text + " " + line2Text).trim().split(/\s+/).filter(Boolean);
      const longestWord = [...globalWords].sort((a, b) => b.length - a.length)[0];

      const renderBeastLine = (lineWordsList: string[]) => (
        <span className="flex flex-nowrap whitespace-nowrap justify-center gap-x-1.5 leading-none py-1 select-none">
          {lineWordsList.map((word, idx) => {
            const isHighlighted = word.toUpperCase() === longestWord.toUpperCase() && globalWords.length > 1;
            let colorClass = "text-white";
            if (isHighlighted) colorClass = "text-green-400 font-extrabold scale-110 inline-block drop-shadow-[2px_2px_0_rgba(0,0,0,1)]";
            else if (idx % 2 === 0) colorClass = "text-white font-extrabold drop-shadow-[2px_2px_0_rgba(0,0,0,1)]";
            else colorClass = "text-yellow-400 font-extrabold drop-shadow-[2px_2px_0_rgba(0,0,0,1)]";
            return <span key={idx} className={`${colorClass} transform -rotate-2`}>{word.toUpperCase()}</span>;
          })}
        </span>
      );

      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center">
          {useTwoLines ? (
            <>
              {renderBeastLine(line1Words)}
              {renderBeastLine(line2Words)}
            </>
          ) : (
            renderBeastLine(line1Words)
          )}
        </span>
      );
    }

    if (templateId === "viral-shorts") {
      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center">
          {useTwoLines ? (
            <>
              <span className="text-white whitespace-nowrap font-extrabold drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">{line1Text.toUpperCase()}</span>
              <span className="text-yellow-400 whitespace-nowrap font-extrabold drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">{line2Text.toUpperCase()}</span>
            </>
          ) : (
            <span className="text-yellow-400 whitespace-nowrap font-extrabold drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">{line1Text.toUpperCase()}</span>
          )}
        </span>
      );
    }

    if (templateId === "reels-trending") {
      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center">
          {useTwoLines ? (
            <>
              <span className="whitespace-nowrap font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{line1Text.toUpperCase()}</span>
              <span className="whitespace-nowrap font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{line2Text.toUpperCase()}</span>
            </>
          ) : (
            <span className="whitespace-nowrap font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{line1Text.toUpperCase()}</span>
          )}
        </span>
      );
    }

    if (templateId === "emotional-story") {
      return (
        <span className="flex flex-col gap-1 items-center justify-center text-center italic font-medium">
          {useTwoLines ? (
            <>
              <span className="whitespace-nowrap text-white/90">{line1Text}</span>
              <span className="whitespace-nowrap text-amber-100">{line2Text}</span>
            </>
          ) : (
            <span className="whitespace-nowrap text-amber-100">{line1Text}</span>
          )}
        </span>
      );
    }

    return (
      <span className="flex flex-col gap-1 items-center justify-center text-center">
        {useTwoLines ? (
          <>
            <span className="whitespace-nowrap">{line1Text}</span>
            <span className="whitespace-nowrap">{line2Text}</span>
          </>
        ) : (
          <span className="whitespace-nowrap">{line1Text}</span>
        )}
      </span>
    );
  };

  const getDynamicStyle = (tmplId: TemplateId) => {
    const alpha = captionBgOpacity / 100;
    if (tmplId === 'simple-white') {
      return { 
        backgroundColor: `rgba(0, 0, 0, ${alpha})` 
      };
    }
    if (tmplId === 'viral-shorts') {
      return { 
        backgroundColor: `rgba(0, 0, 0, ${alpha})`,
        borderColor: `rgba(250, 204, 21, ${alpha})` 
      };
    }
    if (tmplId === 'emoji-fusion') {
      return { 
        backgroundColor: `rgba(15, 12, 30, ${alpha})`,
        borderColor: `rgba(236, 72, 153, ${alpha})`,
        boxShadow: `0 0 20px rgba(236, 72, 153, ${alpha * 0.4})`
      };
    }
    if (tmplId === 'reels-trending') {
      return { 
        backgroundColor: `rgba(2, 6, 23, ${alpha * 0.8})`,
        borderColor: `rgba(34, 211, 238, ${alpha * 0.5})`,
        boxShadow: `0 0 15px rgba(34, 211, 238, ${alpha * 0.4})`
      };
    }
    if (tmplId === 'karaoke-pro') {
      return { 
        backgroundColor: `rgba(10, 10, 15, ${alpha})`,
        borderColor: `rgba(16, 185, 129, ${alpha})`,
        boxShadow: `0 0 25px rgba(16, 185, 129, ${alpha * 0.3})`
      };
    }
    return {};
  };
  
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [apiErrorDetail, setApiErrorDetail] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("user_gemini_api_key") || "";
  });
  const [showApiSettings, setShowApiSettings] = useState<boolean>(false);
  const [showApiKeyPlain, setShowApiKeyPlain] = useState<boolean>(false);

  // Helper to point relative API endpoints to the live hosted backend when running in APK or other wrappers
  const resolveApiUrl = (path: string): string => {
    if ((import.meta as any).env?.DEV) {
      return path;
    }
    const origin = window.location.origin;
    const isApkOrExternal = !origin || 
                            origin.startsWith("file://") || 
                            origin.startsWith("capacitor://") || 
                            origin.startsWith("app://") || 
                            origin.includes("localhost") || 
                            origin === "null" ||
                            !origin.includes("run.app");
                            
    if (isApkOrExternal) {
      // Directs to the production backend of the application
      return `https://ais-pre-gcqusul2m4h6tnpmf5vtyf-267455433433.asia-southeast1.run.app${path}`;
    }
    return path;
  };

  // Save key to local storage when changed
  useEffect(() => {
    localStorage.setItem("user_gemini_api_key", apiKey);
  }, [apiKey]);

  // Key testing states
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string>("");

  const testApiKey = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setTestStatus("error");
      setTestMessage("Please enter an API Key first. (कृपया पहले एक एपीआई की डालें।)");
      return;
    }
    setTestStatus("testing");
    setTestMessage("");
    try {
      // Direct client-side verification to Google Gemini API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${trimmedKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello, reply with YES" }] }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.candidates && data.candidates.length > 0) {
          setTestStatus("success");
          setTestMessage("✓ Key Connected Successfully! (एपीआई की सफलतापूर्वक जुड़ गई है!)");
          setApiKey(trimmedKey);
          localStorage.setItem("user_gemini_api_key", trimmedKey);
          setIsSimulated(false);
          setApiErrorDetail("");
          return;
        }
      }

      // If direct call fails (e.g. CORS, but Gemini REST API allows CORS), fallback to backend
      console.warn("Direct verification unsuccessful or returned non-ok status, trying backend verification fallback...");
      const backendResponse = await fetch(resolveApiUrl("/api/test-key"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmedKey })
      });
      const data = await backendResponse.json();
      if (backendResponse.ok && data.success) {
        setTestStatus("success");
        setTestMessage(data.message || "Connected successfully! (सफलतापूर्वक जुड़ गया है!)");
        setApiKey(trimmedKey);
        localStorage.setItem("user_gemini_api_key", trimmedKey);
        setIsSimulated(false);
        setApiErrorDetail("");
      } else {
        setTestStatus("error");
        setTestMessage(data.error || "Verification failed. Please check your key. (सत्यापन विफल।)");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(err.message || "Failed to reach server or Google Gemini API. (कनेक्शन विफल।)");
    }
  };
  
  // Playback States
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [highlightedCaptionId, setHighlightedCaptionId] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captionListRef = useRef<HTMLDivElement | null>(null);

  // Register PWA Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => console.log('Service Worker registered successfully:', reg.scope))
          .catch(err => console.log('Service Worker registration failed:', err));
      });
    }
  }, []);

  // Update playback time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      // Scroll active caption into view
      const activeIdx = captions.findIndex(c => time >= c.start && time <= c.end);
      if (activeIdx !== -1 && activeIdx !== highlightedCaptionId) {
        setHighlightedCaptionId(activeIdx);
        const captionEl = document.getElementById(`caption-card-${activeIdx}`);
        if (captionEl && captionListRef.current) {
          captionListRef.current.scrollTo({
            top: captionEl.offsetTop - 100,
            behavior: "smooth"
          });
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setVideoWidth(videoRef.current.videoWidth || 720);
      setVideoHeight(videoRef.current.videoHeight || 1280);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadVideo(file);
    }
  };

  const loadVideo = (file: File) => {
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setCaptions([]);
    setIsSimulated(false);
    setApiErrorDetail("");
    setProgressPercent(0);
    setLoadingStep("idle");
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Core Generation Function
  const generateAutoCaptions = async () => {
    if (!videoFile) return;

    try {
      setApiErrorDetail("");
      // Step 1: Extract Audio
      setLoadingStep("extracting");
      setProgressPercent(0);
      
      const { base64, duration: audioDuration } = await extractAudioFromVideo(
        videoFile,
        (percent) => setProgressPercent(percent)
      );

      // Step 2: Speech-to-text Transcription
      setLoadingStep("transcribing");
      setProgressPercent(10); // initial API call delay representation

      const trimmedApiKey = apiKey.trim();
      let captionsResult = null;
      let usedClientSide = false;

      if (trimmedApiKey) {
        try {
          console.log("[STT] Custom API Key detected. Transcribing directly via client-side Google Gemini API...");
          captionsResult = await transcribeAudioClientSide(base64, selectedLanguage, audioDuration, trimmedApiKey);
          usedClientSide = true;
          setIsSimulated(false);
          setApiErrorDetail("");
        } catch (clientErr: any) {
          console.warn("[STT] Client-side direct transcription failed, falling back to server-side transcription...", clientErr);
        }
      }

      if (!usedClientSide) {
        const response = await fetch(resolveApiUrl("/api/transcribe"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            ...(trimmedApiKey ? { "x-gemini-api-key": trimmedApiKey } : {})
          },
          body: JSON.stringify({
            audio: base64,
            language: selectedLanguage,
            duration: audioDuration,
            apiKey: trimmedApiKey || undefined
          })
        });

        if (!response.ok) {
          throw new Error("Transcriber API returned an error status");
        }

        const result = await response.json();
        
        if (result.success && result.captions) {
          captionsResult = result.captions;
          const sim = result.simulation || false;
          setIsSimulated(sim);
          if (sim) {
            setApiErrorDetail(result.errorDetail || "Running in demo simulation mode.");
          }
        } else {
          throw new Error(result.error || "Failed to generate captions");
        }
      }

      if (captionsResult) {
        setCaptions(captionsResult);
      }

    } catch (err: any) {
      console.error("Auto transcription pipeline error:", err);
      // Failover directly to client-side simulated cues
      setIsSimulated(true);
      setApiErrorDetail(err.message || "Failed to establish a speech transcription channel.");
      const simulatedList = [
        { text: "ନମସ୍କାର ବନ୍ଧୁଗଣ", start: 0.5, end: 2.0 },
        { text: "ଓଡ଼ିଆ ଅଟୋ କ୍ୟାପ୍ସନ ମେକର", start: 2.2, end: 4.2 },
        { text: "ଆପଣଙ୍କ ଭିଡିଓରେ", start: 4.5, end: 6.0 },
        { text: "ଭାଇରାଲ ଷ୍ଟାଇଲ୍ ଯୋଡନ୍ତୁ", start: 6.2, end: 8.5 },
        { text: "ଏହାକୁ ଏକ୍ସପୋର୍ଟ କରନ୍ତୁ", start: 8.8, end: 11.0 }
      ];
      setCaptions(simulatedList);
    } finally {
      setLoadingStep("idle");
    }
  };

  // Subtitle Editors
  const updateCaptionText = (index: number, newText: string) => {
    const updated = [...captions];
    updated[index].text = newText;
    setCaptions(updated);
  };

  const updateCaptionTimes = (index: number, start: number, end: number) => {
    const updated = [...captions];
    updated[index].start = Math.max(0, parseFloat(start.toFixed(2)));
    updated[index].end = Math.max(updated[index].start + 0.1, parseFloat(end.toFixed(2)));
    // Sort captions in chronological order
    updated.sort((a, b) => a.start - b.start);
    setCaptions(updated);
  };

  const deleteCaption = (index: number) => {
    const updated = captions.filter((_, idx) => idx !== index);
    setCaptions(updated);
  };

  const addCaption = () => {
    const newCap: Caption = {
      text: selectedLanguage === "Odia" ? "ନୂଆ କ୍ୟାପ୍ସନ" : (selectedLanguage === "Hindi" ? "नया कैप्शन" : "New Caption"),
      start: parseFloat(currentTime.toFixed(2)),
      end: parseFloat((currentTime + 1.5).toFixed(2))
    };
    const updated = [...captions, newCap].sort((a, b) => a.start - b.start);
    setCaptions(updated);
  };

  // Generate and play/pause single caption AI Voiceover
  const generateAndPlaySingleCaption = async (index: number) => {
    const caption = captions[index];
    if (!caption) return;

    // If already playing, pause it
    if (singlePlayingIndices[index]) {
      const existingPlayer = singleAudioPlayersRef.current[index];
      if (existingPlayer) {
        existingPlayer.pause();
        setSinglePlayingIndices(prev => ({ ...prev, [index]: false }));
      }
      return;
    }

    // If already generated, play it
    if (singleCaptionVoiceUrls[index]) {
      const existingPlayer = singleAudioPlayersRef.current[index];
      if (existingPlayer) {
        existingPlayer.currentTime = 0;
        existingPlayer.play()
          .then(() => {
            setSinglePlayingIndices(prev => ({ ...prev, [index]: true }));
          })
          .catch(err => console.warn("Single play failed:", err));
      }
      return;
    }

    // Generate
    setLoadingSingleIndices(prev => ({ ...prev, [index]: true }));
    try {
      const text = caption.text.trim();
      const colonIdx = text.indexOf(":");
      let character = "";
      if (colonIdx > 0 && colonIdx < 15) {
        character = text.substring(0, colonIdx).trim();
      }

      // Generate single speech segment (times are normalized to start at 0.0s for individual playback)
      const normalizedCaption = { ...caption, start: 0, end: caption.end - caption.start, character };

      const trimmedApiKey = apiKey.trim() || localStorage.getItem("user_gemini_api_key") || "";
      let base64Audio = "";
      let usedClientSide = false;

      if (trimmedApiKey) {
        try {
          console.log("[TTS] Custom API Key detected. Synthesizing single segment directly via client-side Google Gemini API...");
          const clientRes = await synthesizeSpeechClientSide(
            [normalizedCaption],
            voiceAssignments,
            defaultVoice,
            selectedVoiceStyle,
            selectedLanguage,
            trimmedApiKey
          );
          if (clientRes && clientRes.success) {
            base64Audio = clientRes.audioBase64;
            usedClientSide = true;
          }
        } catch (clientErr: any) {
          console.warn("[TTS] Client-side single synthesis failed, falling back to server-side...", clientErr);
        }
      }

      if (!usedClientSide) {
        const response = await fetch(resolveApiUrl("/api/synthesize"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-api-key": trimmedApiKey
          },
          body: JSON.stringify({
            captions: [normalizedCaption],
            voiceAssignments,
            defaultVoice,
            style: selectedVoiceStyle,
            language: selectedLanguage,
            apiKey: trimmedApiKey || undefined
          })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to synthesize speech segment.");
        }
        base64Audio = data.audioBase64;
      }
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      setSingleCaptionVoiceUrls(prev => ({ ...prev, [index]: url }));

      // Create new HTMLAudioElement player
      const aud = new Audio(url);
      aud.onended = () => {
        setSinglePlayingIndices(prev => ({ ...prev, [index]: false }));
      };
      singleAudioPlayersRef.current[index] = aud;

      aud.play()
        .then(() => {
          setSinglePlayingIndices(prev => ({ ...prev, [index]: true }));
        })
        .catch(err => console.warn("Single play failed:", err));

    } catch (err: any) {
      console.error("[TTS Single] Synthesis failed:", err);
      alert(err.message || "Failed to generate single voice preview.");
    } finally {
      setLoadingSingleIndices(prev => ({ ...prev, [index]: false }));
    }
  };

  const downloadSingleCaptionWav = (index: number) => {
    const url = singleCaptionVoiceUrls[index];
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `single_voiceover_${index + 1}_${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Standalone Speech Synthesis Operations
  const convertAndDownloadMp3FromBlob = async (blob: Blob) => {
    try {
      // @ts-ignore
      if (typeof lamejs === 'undefined') {
        throw new Error("LAME MP3 encoder is loading. Please try again.");
      }

      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } finally {
        try {
          await audioCtx.close();
        } catch (e) {
          console.warn("[Standalone MP3] Failed to close audio context:", e);
        }
      }
      
      const sampleRate = audioBuffer.sampleRate;
      const samples = audioBuffer.getChannelData(0); // mono
      
      // @ts-ignore
      const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
      const mp3Data: any[] = [];
      const sampleBlockSize = 1152;
      
      // Convert Float32 to Int16
      const pcmSamples = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        pcmSamples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      for (let i = 0; i < pcmSamples.length; i += sampleBlockSize) {
        const sampleChunk = pcmSamples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }
      
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
      
      const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const url = URL.createObjectURL(mp3Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `standalone_voice_${selectedVoiceStyle}_${Date.now()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("[Standalone MP3] Conversion failed:", err);
      alert(err.message || "Failed to encode MP3. Downloading WAV file instead.");
      
      // Fallback to WAV download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `standalone_voice_${selectedVoiceStyle}_${Date.now()}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const generateStandaloneVoice = async (autoDownloadFormat?: "mp3" | "wav") => {
    if (!standaloneText.trim()) {
      setStandaloneError("Please enter some text to speak first! (कृपया बोलने के लिए कुछ टेक्स्ट लिखें!)");
      return;
    }

    setIsSynthesizingStandalone(true);
    setStandaloneError(null);

    try {
      const trimmedApiKey = apiKey.trim() || localStorage.getItem("user_gemini_api_key") || "";
      let base64Audio = "";
      let usedClientSide = false;

      if (trimmedApiKey) {
        try {
          console.log("[TTS] Custom API Key detected. Synthesizing standalone voice directly via client-side Google Gemini API...");
          const clientRes = await synthesizeSpeechClientSide(
            [{ text: standaloneText, start: 0, end: 5.0 }],
            {},
            standaloneVoice,
            selectedVoiceStyle,
            selectedLanguage,
            trimmedApiKey
          );
          if (clientRes && clientRes.success) {
            base64Audio = clientRes.audioBase64;
            usedClientSide = true;
          }
        } catch (clientErr: any) {
          console.warn("[TTS] Client-side standalone synthesis failed, falling back to server-side...", clientErr);
        }
      }

      if (!usedClientSide) {
        const response = await fetch(resolveApiUrl("/api/synthesize"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-api-key": trimmedApiKey
          },
          body: JSON.stringify({
            captions: [{ text: standaloneText, start: 0, end: 5.0 }],
            voiceAssignments: {},
            defaultVoice: standaloneVoice,
            style: selectedVoiceStyle,
            language: selectedLanguage,
            apiKey: trimmedApiKey || undefined
          })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to synthesize speech.");
        }
        base64Audio = data.audioBase64;
      }
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      setStandaloneVoiceBlob(blob);
      setStandaloneVoiceUrl(url);

      // Instantly load into standalone audio ref
      if (standaloneAudioRef.current) {
        standaloneAudioRef.current.src = url;
        standaloneAudioRef.current.load();
      }

      console.log("[TTS Standalone] Successfully generated standalone voice!");

      // Auto-download triggers immediately!
      if (autoDownloadFormat === "wav") {
        const link = document.createElement("a");
        link.href = url;
        link.download = `standalone_voice_${selectedVoiceStyle}_${Date.now()}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (autoDownloadFormat === "mp3") {
        await convertAndDownloadMp3FromBlob(blob);
      }

    } catch (err: any) {
      console.error("[TTS Standalone] Generation error:", err);
      setStandaloneError(err.message || "Speech synthesis failed. Check your API key or network connection.");
    } finally {
      setIsSynthesizingStandalone(false);
    }
  };

  const toggleStandalonePlayback = () => {
    if (!standaloneAudioRef.current || !standaloneVoiceUrl) return;

    if (isPlayingStandalone) {
      standaloneAudioRef.current.pause();
      setIsPlayingStandalone(false);
    } else {
      standaloneAudioRef.current.play()
        .then(() => setIsPlayingStandalone(true))
        .catch(err => console.warn("Standalone play failed:", err));
    }
  };

  const downloadStandaloneWav = () => {
    if (!standaloneVoiceBlob) return;
    const url = URL.createObjectURL(standaloneVoiceBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `standalone_voice_${selectedVoiceStyle}_${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadStandaloneMp3 = async () => {
    if (!standaloneVoiceBlob) return;
    await convertAndDownloadMp3FromBlob(standaloneVoiceBlob);
  };

  // Voice Synthesis Operations
  const generateAIVoice = async () => {
    if (captions.length === 0) {
      setVoiceSynthesisError("No captions available to speak. Generate or add some first! (कृपया पहले कैप्शन जनरेट करें।)");
      return;
    }

    setIsSynthesizing(true);
    setVoiceSynthesisError(null);

    try {
      // Build request body with characters attached
      const captionsWithCharacters = captions.map(cap => {
        const text = cap.text.trim();
        const colonIdx = text.indexOf(":");
        let character = "";
        if (colonIdx > 0 && colonIdx < 15) {
          character = text.substring(0, colonIdx).trim();
        }
        return {
          ...cap,
          character
        };
      });

      const trimmedApiKey = apiKey.trim() || localStorage.getItem("user_gemini_api_key") || "";
      let base64Audio = "";
      let usedClientSide = false;

      if (trimmedApiKey) {
        try {
          console.log("[TTS] Custom API Key detected. Synthesizing full composite voice directly via client-side Google Gemini API...");
          const clientRes = await synthesizeSpeechClientSide(
            captionsWithCharacters,
            voiceAssignments,
            defaultVoice,
            selectedVoiceStyle,
            selectedLanguage,
            trimmedApiKey
          );
          if (clientRes && clientRes.success) {
            base64Audio = clientRes.audioBase64;
            usedClientSide = true;
          }
        } catch (clientErr: any) {
          console.warn("[TTS] Client-side composite synthesis failed, falling back to server-side...", clientErr);
        }
      }

      if (!usedClientSide) {
        const response = await fetch(resolveApiUrl("/api/synthesize"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-api-key": trimmedApiKey
          },
          body: JSON.stringify({
            captions: captionsWithCharacters,
            voiceAssignments,
            defaultVoice,
            style: selectedVoiceStyle,
            language: selectedLanguage,
            apiKey: trimmedApiKey || undefined
          })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to synthesize speech.");
        }
        base64Audio = data.audioBase64;
      }
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      setSynthesizedVoiceBlob(blob);
      setSynthesizedVoiceUrl(url);

      // Instantly load into ref audio player
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url;
        audioPlayerRef.current.load();
      }

      console.log("[TTS] Successfully synchronized AI voice compiled!");
    } catch (err: any) {
      console.error("[TTS] Generation error:", err);
      setVoiceSynthesisError(err.message || "Speech synthesis failed. Check your API key or network connection.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  const toggleVoicePlayback = () => {
    if (!audioPlayerRef.current || !synthesizedVoiceUrl) return;

    if (isPlayingVoice) {
      audioPlayerRef.current.pause();
      setIsPlayingVoice(false);
    } else {
      audioPlayerRef.current.play()
        .then(() => setIsPlayingVoice(true))
        .catch(err => console.warn("Audio play failed:", err));
    }
  };

  const downloadWav = () => {
    if (!synthesizedVoiceBlob) return;
    const url = URL.createObjectURL(synthesizedVoiceBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai_voiceover_${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadMp3 = async () => {
    if (!synthesizedVoiceBlob) return;
    setIsExportingMp3(true);
    try {
      // @ts-ignore
      if (typeof lamejs === 'undefined') {
        throw new Error("LAME MP3 encoder is loading. Please wait a moment and try again.");
      }

      const arrayBuffer = await synthesizedVoiceBlob.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } finally {
        try {
          await audioCtx.close();
        } catch (e) {
          console.warn("[MP3] Failed to close audio context:", e);
        }
      }
      
      const sampleRate = audioBuffer.sampleRate;
      const samples = audioBuffer.getChannelData(0); // mono
      
      // @ts-ignore
      const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
      const mp3Data: any[] = [];
      const sampleBlockSize = 1152;
      
      // Convert Float32 to Int16
      const pcmSamples = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        pcmSamples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      for (let i = 0; i < pcmSamples.length; i += sampleBlockSize) {
        const sampleChunk = pcmSamples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }
      
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
      
      const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const url = URL.createObjectURL(mp3Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ai_voiceover_${Date.now()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("[MP3] Conversion failed:", err);
      alert(err.message || "Failed to encode MP3. Downloading WAV file instead.");
      downloadWav();
    } finally {
      setIsExportingMp3(false);
    }
  };

  const previewVoiceCategory = async (voiceCategory: string) => {
    setPreviewingVoice(voiceCategory);
    try {
      let text = "Hello! This is a preview.";
      if (selectedLanguage === "Odia") {
        text = "ନମସ୍କାର! ଏହା ଏକ ପୂର୍ବାବଲୋକନ |";
      } else if (selectedLanguage === "Hindi") {
        text = "नमस्ते! यह एक प्रिव्यू है।";
      }

      const trimmedApiKey = apiKey.trim() || localStorage.getItem("user_gemini_api_key") || "";
      let base64Audio = "";
      let usedClientSide = false;

      if (trimmedApiKey) {
        try {
          console.log("[TTS] Custom API Key detected. Previewing voice directly via client-side Google Gemini API...");
          const clientRes = await synthesizeSpeechClientSide(
            [{ text, start: 0, end: 1.5 }],
            {},
            voiceCategory,
            selectedVoiceStyle,
            selectedLanguage,
            trimmedApiKey
          );
          if (clientRes && clientRes.success) {
            base64Audio = clientRes.audioBase64;
            usedClientSide = true;
          }
        } catch (clientErr: any) {
          console.warn("[TTS] Client-side voice preview failed, falling back to server-side...", clientErr);
        }
      }

      if (!usedClientSide) {
        const response = await fetch(resolveApiUrl("/api/synthesize"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gemini-api-key": trimmedApiKey
          },
          body: JSON.stringify({
            captions: [{ text, start: 0, end: 1.5 }],
            voiceAssignments: {},
            defaultVoice: voiceCategory,
            style: selectedVoiceStyle,
            language: selectedLanguage,
            apiKey: trimmedApiKey || undefined
          })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to generate preview.");
        }
        base64Audio = data.audioBase64;
      }
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      const aud = new Audio(url);
      aud.play();
    } catch (err: any) {
      console.error("[TTS Preview] Preview failed:", err);
      alert(err.message || "Failed to generate voice preview.");
    } finally {
      setPreviewingVoice(null);
    }
  };

  const [copiedCaptions, setCopiedCaptions] = useState(false);

  // Calculate standard display aspect ratio for player preview container
  const getPlayerAspectRatioStyle = () => {
    if (aspectRatio === "original") {
      return { aspectRatio: `${videoWidth} / ${videoHeight}` };
    }
    const [w, h] = aspectRatio.split(":").map(Number);
    return { aspectRatio: `${w} / ${h}` };
  };

  // Export File Triggers
  const getCalibratedCaptions = () => {
    return captions.map(c => ({
      ...c,
      start: Math.max(0, parseFloat((c.start - globalTimeOffset).toFixed(3))),
      end: Math.max(0.1, parseFloat((c.end - globalTimeOffset).toFixed(3))),
    }));
  };

  const handleExportSRT = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const srtContent = captionsToSRT(calibrated);
    downloadFile(srtContent, `odia_auto_caption_${Date.now()}.srt`, "text/srt");
  };

  const handleExportTXT = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const txtContent = captionsToTXT(calibrated);
    downloadFile(txtContent, `odia_auto_transcript_${Date.now()}.txt`, "text/plain");
  };

  const handleExportJSON = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const jsonContent = captionsToJSON(calibrated);
    downloadFile(jsonContent, `odia_auto_captions_${Date.now()}.json`, "application/json");
  };

  const handleCopyAllCaptions = () => {
    if (captions.length === 0) return;
    const allText = captions.map(c => c.text).join("\n");
    navigator.clipboard.writeText(allText).then(() => {
      setCopiedCaptions(true);
      setTimeout(() => setCopiedCaptions(false), 2000);
    }).catch(err => {
      console.error("Failed to copy captions: ", err);
    });
  };

  // Fetch current active caption to display on video player overlay (adjusted with timing calibration)
  const activeCaption = captions.find(c => (currentTime + globalTimeOffset) >= c.start && (currentTime + globalTimeOffset) <= c.end);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-10" id="app-container">
      {/* Sleek Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-pink-500 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/10">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-black tracking-tight bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent flex items-center gap-1.5 font-sans">
              {activeWorkspace === "caption" 
                ? "Odia Auto Caption Studio" 
                : activeWorkspace === "voice" 
                ? "AI Professional Voice Studio" 
                : "Odia AI Video & Voice Suite"}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              {activeWorkspace === "caption"
                ? "AUTO CAPTION & SPEECH SYNC"
                : activeWorkspace === "voice"
                ? "NEURAL TEXT-TO-SPEECH GENERATOR"
                : "CC GEN PRO • FOR ANDROID & WEB"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeWorkspace !== null && (
            <button
              onClick={() => setActiveWorkspace(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition active:scale-95 cursor-pointer shadow-md"
            >
              <Home className="w-3.5 h-3.5 text-pink-500" />
              <span className="hidden sm:inline">Main Menu (मुख्य मेनू)</span>
            </button>
          )}

          {isSimulated && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <InfoIcon className="w-3.5 h-3.5" />
              Simulation Mode
            </span>
          )}
          <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700/60 font-mono hidden md:inline">
            v1.2.0-apk
          </span>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <main className="max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {activeWorkspace === null ? (
          /* Landing/Welcome screen */
          <div className="col-span-1 lg:col-span-12 py-10 px-4 sm:px-6 max-w-4xl mx-auto w-full text-center space-y-12 animate-fadeIn">
            <div className="space-y-4">
              <span className="bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-indigo-500/10 border border-pink-500/20 text-pink-400 font-extrabold text-[10px] sm:text-xs uppercase px-4 py-1.5 rounded-full tracking-widest inline-flex items-center gap-1.5 shadow-lg shadow-pink-500/5 animate-pulse">
                ✨ Powered by Google Gemini AI
              </span>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-pink-400 to-indigo-400">Professional Studio</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto font-medium">
                Create high-fidelity viral captions synced with voiceover, or generate professional neural voiceovers with full emotional controls instantly.
              </p>
            </div>

            {/* Visual Theme Selector Card */}
            <div className="max-w-md mx-auto bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 space-y-3 shadow-xl animate-fadeIn">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                🎨 CHOOSE APP VISUAL ACCENT THEME (थीम बदलें)
              </span>
              <div className="flex items-center justify-center gap-3">
                {([
                  { id: "indigo", name: "Indigo Fusion", color: "bg-indigo-500 shadow-indigo-500/30" },
                  { id: "pink", name: "Neon Cyber", color: "bg-pink-500 shadow-pink-500/30" },
                  { id: "amber", name: "Sunset Amber", color: "bg-amber-500 shadow-amber-500/30" },
                  { id: "emerald", name: "Mint Emerald", color: "bg-emerald-500 shadow-emerald-500/30" },
                  { id: "slate", name: "Titanium Slate", color: "bg-slate-400 shadow-slate-500/30" },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => changeTheme(t.id)}
                    className={`group relative flex items-center justify-center p-1 rounded-full border-2 transition-all cursor-pointer ${
                      appTheme === t.id ? "border-white scale-110" : "border-transparent hover:border-slate-700"
                    }`}
                    title={t.name}
                  >
                    <span className={`w-6.5 h-6.5 rounded-full block shadow-md ${t.color}`} />
                    <span className="absolute -top-9 bg-slate-950 border border-slate-800 text-[9px] font-bold text-slate-200 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      {t.name}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 font-medium italic">
                Active Accent: <span className={`font-extrabold uppercase ${themeColors.text}`}>{appTheme}</span>. All buttons, highlights, and micro-actions adapt instantly!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Option 1: Video Auto Caption */}
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspace("caption");
                }}
                className={`group relative bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border-2 border-slate-800/80 ${themeColors.hoverBorder} p-8 rounded-3xl text-left transition-all duration-300 shadow-xl ${themeColors.hoverShadow} flex flex-col justify-between min-h-[280px] cursor-pointer`}
              >
                <div className="space-y-4">
                  <div className={`w-14 h-14 rounded-2xl ${themeColors.iconBg} flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300 shadow-md`}>
                    🎬
                  </div>
                  <div className="space-y-1.5">
                    <h3 className={`text-lg font-black text-white flex items-center gap-2 ${themeColors.groupHoverText} transition-colors`}>
                      <span>Video Auto Captioning Studio</span>
                    </h3>
                    <p className={`text-[11px] ${themeColors.text} font-mono tracking-wider uppercase font-bold`}>वीडियो ऑटो कैप्शनिंग स्टूडियो</p>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Automatically extract soundtracks, transcribe with Gemini AI, edit timings, and burn custom-styled viral subtitles onto your video timeline perfectly.
                    </p>
                  </div>
                </div>
                <div className={`mt-6 flex items-center justify-between text-xs font-bold text-slate-300 ${themeColors.groupHoverText} transition-all border-t border-slate-850 pt-4 w-full`}>
                  <span>Enter Captioning Studio</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                </div>
              </button>

              {/* Option 2: AI Professional Voice Generator */}
              <button
                type="button"
                onClick={() => {
                  setActiveWorkspace("voice");
                  setActiveVoiceTab("standalone");
                }}
                className={`group relative bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border-2 border-slate-800/80 ${themeColors.hoverBorder} p-8 rounded-3xl text-left transition-all duration-300 shadow-xl ${themeColors.hoverShadow} flex flex-col justify-between min-h-[280px] cursor-pointer`}
              >
                <div className="space-y-4">
                  <div className={`w-14 h-14 rounded-2xl ${themeColors.iconBg} flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300 shadow-md`}>
                    🎙️
                  </div>
                  <div className="space-y-1.5">
                    <h3 className={`text-lg font-black text-white flex items-center gap-2 ${themeColors.groupHoverText} transition-colors`}>
                      <span>AI Professional Voice Generator</span>
                    </h3>
                    <p className={`text-[11px] ${themeColors.text} font-mono tracking-wider uppercase font-bold`}>एआई प्रोफेशनल वॉइस जनरेटर</p>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Write custom scripts in Odia, Hindi, or English and convert them to speech instantly. Access 10+ professional neural actors and fine-tune emotional styles (Natural, Happy, Crying, etc.).
                    </p>
                  </div>
                </div>
                <div className={`mt-6 flex items-center justify-between text-xs font-bold text-slate-300 ${themeColors.groupHoverText} transition-all border-t border-slate-850 pt-4 w-full`}>
                  <span>Enter Voice Generator Studio</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                </div>
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto pt-6 border-t border-slate-900 text-center">
              <div>
                <span className="block text-xl">⚡</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mt-1">Zero Latency Previews</span>
              </div>
              <div>
                <span className="block text-xl">🎭</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mt-1">Full Emotional Speech</span>
              </div>
              <div>
                <span className="block text-xl">💎</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mt-1">Premium Exports</span>
              </div>
            </div>
          </div>
        ) : activeWorkspace === "voice" ? (
          /* Standalone Voice Generator Studio */
          <div className="col-span-1 lg:col-span-12 max-w-4xl mx-auto w-full space-y-6 animate-fadeIn pb-12">
            {/* Header / Intro Card */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-950 rounded-3xl p-6 md:p-8 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
              <div className="space-y-2">
                <span className="bg-pink-500/10 border border-pink-500/20 text-pink-400 font-extrabold text-[10px] uppercase px-3 py-1 rounded-full tracking-widest inline-flex items-center gap-1.5 shadow shadow-pink-500/5">
                  🎙️ AI Professional Voice Generator Studio
                </span>
                <h2 className="text-xl sm:text-3xl font-black text-white">
                  Convert Your Custom Script to Speech
                </h2>
                <p className="text-xs text-slate-400 max-w-xl font-medium leading-relaxed">
                  Enter your text, select any of our 10 professional neural voice actors, pick their emotional expression style, and download custom narration WAVs or MP3s instantly.
                </p>
              </div>

              <div className="shrink-0 flex flex-row md:flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowApiSettings(!showApiSettings)}
                  className={`border rounded-2xl px-4 py-2.5 text-[10px] font-black tracking-wider uppercase transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                    showApiSettings 
                      ? "bg-pink-600 border-pink-500 text-white shadow-lg shadow-pink-500/25 animate-pulse" 
                      : "bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white border-slate-850 hover:border-slate-800"
                  }`}
                >
                  <span>🔑 Key: {apiKey ? "Connected" : "Not Set"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFeaturesModal(true)}
                  className="bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-indigo-500/10 hover:from-amber-500/20 hover:via-pink-500/20 hover:to-indigo-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/20 rounded-2xl px-4 py-2.5 text-[10px] font-black tracking-wider uppercase transition-all duration-350 cursor-pointer flex items-center justify-center gap-2 shadow"
                >
                  <span>✨ New Features (विशेषताएँ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkspace(null)}
                  className="bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-850 hover:border-slate-800 rounded-2xl px-4 py-2.5 text-[10px] font-black tracking-wider uppercase transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Home className="w-3.5 h-3.5 text-pink-500" />
                  <span>Main Menu (मुख्य मेनू)</span>
                </button>
              </div>
            </div>

            {/* Quick API Key Panel for easy entry in Voice workspace */}
            {(showApiSettings || !apiKey) && (
              <div className="border border-slate-800 bg-slate-950/40 rounded-3xl p-6 space-y-4 shadow-xl animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" style={{ animationDuration: '3s' }} />
                    <span>Gemini API Key Settings (🔑 {apiKey ? "Entered" : "Required for Professional Voices"})</span>
                  </div>
                  {apiKey && (
                    <button
                      type="button"
                      onClick={() => setShowApiSettings(false)}
                      className="text-[10px] text-pink-400 hover:underline font-mono uppercase tracking-wider"
                    >
                      Hide Settings
                    </button>
                  )}
                </div>

                <div className="space-y-3 text-xs text-slate-400">
                  <p className="leading-relaxed text-[11px]">
                    <strong>Professional AI voice actors require a Google Gemini API Key.</strong>
                    <br />
                    1. Get a free API Key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-pink-400 underline hover:text-pink-300 font-bold">Google AI Studio</a>.
                    <br />
                    2. Paste it in the box below. It is stored securely in your browser's local storage.
                  </p>
                  
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Paste your AI Studio GEMINI_API_KEY here..."
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTestStatus("idle");
                        setTestMessage("");
                      }}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500 font-mono"
                    />
                    {apiKey && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={testApiKey}
                          disabled={testStatus === "testing"}
                          className="bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 px-4 py-2.5 rounded-xl border border-pink-500/20 transition text-xs font-extrabold disabled:opacity-50 cursor-pointer"
                        >
                          {testStatus === "testing" ? "Testing..." : "Test Key"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setApiKey("");
                            setTestStatus("idle");
                            setTestMessage("");
                          }}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2.5 rounded-xl border border-red-500/20 transition text-xs font-extrabold cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {testStatus !== "idle" && (
                    <div className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed ${
                      testStatus === "success" 
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" 
                        : testStatus === "error" 
                        ? "bg-rose-500/10 border-rose-500/25 text-rose-400"
                        : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400 animate-pulse"
                    }`}>
                      <div className="font-bold mb-0.5">
                        {testStatus === "success" && "✓ Connected successfully! (एपीआई की सक्रिय है):"}
                        {testStatus === "error" && "✗ Verification failed (कनेक्शन विफल):"}
                        {testStatus === "testing" && "⚡ Connecting to Gemini API..."}
                      </div>
                      <p className="text-[10px] opacity-90">{testMessage}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Main Interactive Studio Panel */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-800 space-y-8 shadow-xl">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>✍️ Enter Script Text (यहाँ अपना टेक्स्ट लिखें)</span>
                  </label>
                  <span className="text-[10px] bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-850 text-slate-500 font-mono font-bold">
                    CHARACTER COUNT: {standaloneText.length}
                  </span>
                </div>
                
                <textarea
                  rows={8}
                  value={standaloneText}
                  onChange={(e) => setStandaloneText(e.target.value)}
                  placeholder="Type anything here in Odia (ଓଡ଼ିଆ), Hindi (हिंदी), or English. Press 'Generate' below to compile..."
                  className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl p-6 text-lg sm:text-xl lg:text-2xl text-white focus:outline-none focus:border-pink-500 font-semibold placeholder:text-slate-600 transition shadow-inner min-h-[220px] resize-y leading-relaxed"
                />
              </div>

              <div className="space-y-3 border-t border-slate-800/60 pt-6">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    👥 Select Voice Actor (आवाज़ कलाकार चुनें)
                  </label>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Pick from our 10 standard high-fidelity neural voice actors.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-2">
                  {VOICE_CATEGORIES.map((voice) => {
                    const isSelected = standaloneVoice === voice;
                    return (
                      <div 
                        key={voice} 
                        className={`flex flex-col justify-between bg-slate-950 p-4 rounded-2xl border transition-all ${
                          isSelected ? "border-pink-500 bg-slate-950 shadow-lg shadow-pink-500/10" : "border-slate-850 hover:border-slate-800"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setStandaloneVoice(voice)}
                          className={`text-xs font-black text-left leading-tight transition ${
                            isSelected ? "text-pink-400" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {voice}
                        </button>
                        <button
                          type="button"
                          onClick={() => previewVoiceCategory(voice)}
                          disabled={previewingVoice !== null}
                          className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 text-left mt-3.5 flex items-center gap-0.5 font-bold cursor-pointer disabled:opacity-40"
                        >
                          {previewingVoice === voice ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            "▶ Preview Voice"
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-800/60 pt-6">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <span>✨ Select Emotional Tone / Style (आवाज़ का भाव/शैली)</span>
                  </label>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Choose an emotional style to modulate the neural output.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {VOICE_STYLES.map((styleObj) => {
                    const isSelected = selectedVoiceStyle === styleObj.id;
                    return (
                      <button
                        key={styleObj.id}
                        type="button"
                        onClick={() => setSelectedVoiceStyle(styleObj.id)}
                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all text-center gap-2 cursor-pointer ${
                          isSelected
                            ? "border-pink-500 bg-pink-500/10 text-pink-400 shadow-md shadow-pink-500/10 font-black scale-[1.02]"
                            : "border-slate-850 bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                        }`}
                      >
                        <span className="text-2xl">{styleObj.emoji}</span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold tracking-tight leading-none">{styleObj.label}</span>
                          <span className="text-[9px] opacity-70 leading-none">{styleObj.labelHindi}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {standaloneError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 animate-pulse" />
                  <span>{standaloneError}</span>
                </div>
              )}

              <div className="border-t border-slate-800/60 pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => generateStandaloneVoice()}
                    disabled={isSynthesizingStandalone || !standaloneText.trim()}
                    className="bg-slate-850 hover:bg-slate-800 border border-slate-750 disabled:opacity-50 text-slate-200 hover:text-white font-bold text-xs py-4 px-6 rounded-2xl shadow transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSynthesizingStandalone ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4 text-slate-400" />
                        <span>Generate &amp; Preview Only</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => generateStandaloneVoice("mp3")}
                    disabled={isSynthesizingStandalone || !standaloneText.trim()}
                    className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 text-white font-black text-xs py-4 px-6 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    {isSynthesizingStandalone ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <DownloadIcon className="w-4 h-4 text-white" />
                    )}
                    <span>⚡ Generate &amp; Download MP3</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => generateStandaloneVoice("wav")}
                    disabled={isSynthesizingStandalone || !standaloneText.trim()}
                    className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-black text-xs py-4 px-6 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    {isSynthesizingStandalone ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <DownloadIcon className="w-4 h-4 text-white" />
                    )}
                    <span>⚡ Generate &amp; Download WAV</span>
                  </button>
                </div>

                {standaloneVoiceUrl && (
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={toggleStandalonePlayback}
                        className="bg-pink-600 hover:bg-pink-500 text-white p-3.5 rounded-xl transition flex items-center justify-center cursor-pointer shadow-md shadow-pink-600/10"
                        title="Play compiled standalone track"
                      >
                        {isPlayingStandalone ? <Pause className="w-4.5 h-4.5 fill-white" /> : <Play className="w-4.5 h-4.5 fill-white animate-pulse" />}
                      </button>
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-white block">Generated Neural Speech Track</span>
                        <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">{standaloneVoice} • {selectedVoiceStyle} STYLE</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={downloadStandaloneMp3}
                        className="flex-1 sm:flex-none text-xs text-slate-300 hover:text-white px-4 py-2.5 rounded-xl hover:bg-slate-900 border border-slate-800 font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <DownloadIcon className="w-3.5 h-3.5 text-pink-400" />
                        <span>Download MP3</span>
                      </button>

                      <button
                        type="button"
                        onClick={downloadStandaloneWav}
                        className="flex-1 sm:flex-none text-xs text-slate-300 hover:text-white px-4 py-2.5 rounded-xl hover:bg-slate-900 border border-slate-800 font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <DownloadIcon className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Download WAV</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Captioning Studio Mode (Wrapper) */
          <>
            {/* Banner Informational - API setup indicator */}
            {isSimulated && (
              <div className="lg:col-span-12 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl transition-all duration-300">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-white">Running with Intelligent Simulated Fallback</h3>
                    <p className="text-[11px] text-indigo-200 mt-1 leading-relaxed">
                      The app generated localized subtitles. To utilize real production-grade AI Speech-to-Text transcription, configure your <strong>GEMINI_API_KEY</strong> in the <strong>Settings &gt; Secrets</strong> panel.
                      {apiErrorDetail && (
                        <span className="block mt-1.5 text-amber-300 font-mono text-[10px] bg-amber-500/10 p-1.5 rounded border border-amber-500/20 max-w-xl">
                          Status Detail: {apiErrorDetail}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono py-1 px-2.5 rounded-full border border-indigo-400/30">
                    AUTO-FAILOVER ACTIVE
                  </span>
                </div>
              </div>
            )}

            {/* Right Side: Sticky WYSIWYG Video Editor (Compact layout on mobile, premium sticky sidebar on desktop) */}
            <section className="col-span-1 lg:col-span-5 lg:order-2 self-start flex flex-col gap-4">
          {/* 1. Upload Deck */}
          {!videoUrl ? (
            <div 
              onClick={triggerFileInput}
              className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-900/40 rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[350px] shadow-2xl group"
              id="upload-drag-zone"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="video/*" 
                className="hidden" 
              />
              <div className="bg-slate-800/80 p-5 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300 border border-slate-700/50 shadow-lg">
                <Upload className="w-10 h-10 text-indigo-400 group-hover:text-pink-400 transition-colors" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">Upload Video File</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-[280px] leading-relaxed">
                Drag and drop your MP4, WebM or MOV video here, or tap to browse folders. Works locally on Android.
              </p>
              <div className="mt-5 flex gap-1.5 items-center justify-center bg-slate-800/40 border border-slate-700/40 py-1.5 px-3 rounded-full text-[10px] text-slate-400 font-mono">
                <Volume2 className="w-3 h-3 text-indigo-400" /> Auto Soundtrack Extraction
              </div>
            </div>
          ) : (
            <>
              {/* 2. Custom WYSIWYG Video Player Frame */}
              <div className={`bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col relative transition-all duration-300 ${
                videoUrl && !showApiSettings ? "sticky top-[68px] lg:top-24 z-40 bg-slate-900" : ""
              }`}>
              
              {/* Aspect Ratio Selector - Floating Left */}
              <div className="absolute top-4 left-4 z-30 flex items-center">
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as any)}
                  className="bg-black/60 hover:bg-black/80 text-xs font-bold py-1.5 pl-3 pr-8 rounded-full border border-slate-700 backdrop-blur-md transition text-slate-200 outline-none cursor-pointer appearance-none relative style-select shadow-lg text-center"
                  id="select-aspect-ratio"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f472b6' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 10px center",
                    backgroundSize: "12px"
                  }}
                >
                  <option value="original" className="bg-slate-900 text-slate-200 font-semibold">Original Aspect</option>
                  <option value="9:16" className="bg-slate-900 text-slate-200 font-semibold">9:16 (Shorts/Reels)</option>
                  <option value="16:9" className="bg-slate-900 text-slate-200 font-semibold">16:9 (YouTube)</option>
                  <option value="1:1" className="bg-slate-900 text-slate-200 font-semibold">1:1 (Square)</option>
                  <option value="4:5" className="bg-slate-900 text-slate-200 font-semibold">4:5 (Portrait)</option>
                </select>
              </div>

              {/* Reset Video Selection Button */}
              <button 
                onClick={() => {
                  setVideoFile(null);
                  setVideoUrl("");
                  setCaptions([]);
                }}
                className="absolute top-4 right-4 z-30 bg-black/60 hover:bg-black/80 text-xs font-semibold py-1.5 px-3 rounded-full border border-slate-700 backdrop-blur-md transition flex items-center gap-1 shadow-lg"
                id="btn-change-video"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                Change Video
              </button>

              {/* Aspect Ratio Display Stage */}
              <div className="w-full h-[260px] xs:h-[320px] sm:h-[380px] lg:h-[480px] bg-slate-950/60 p-2 sm:p-4 flex items-center justify-center relative overflow-hidden border-b border-slate-800">
                {/* Visual player box with true aspect ratio */}
                <div 
                  ref={playerContainerRef}
                  style={{
                    ...getPlayerAspectRatioStyle(),
                  }}
                  className="relative bg-black w-auto h-auto max-w-full max-h-full flex items-center justify-center group/player overflow-hidden select-none transition-all duration-300 rounded-xl shadow-2xl"
                >
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={togglePlay}
                    className={`w-full h-full ${aspectRatio === "original" ? "object-contain" : "object-cover"} pointer-events-none transition-all duration-300`}
                    playsInline
                  />

                  {/* REAL-TIME DRAGGABLE & SCALABLE OVERLAY */}
                  {activeCaption && (
                    <div
                      onPointerDown={handleCaptionPointerDown}
                      onPointerMove={handleCaptionPointerMove}
                      onPointerUp={handleCaptionPointerUp}
                      style={{
                        left: `${captionX}%`,
                        top: `${captionY}%`,
                        transform: `translate(-50%, -50%) scale(${captionScale})`,
                        touchAction: "none",
                      }}
                      className={`absolute z-30 cursor-move select-none p-2 rounded-2xl border transition-all flex flex-col items-center gap-1 group/overlay ${
                        isDragging 
                          ? "border-pink-500 bg-black/40 shadow-[0_0_20px_rgba(236,72,153,0.4)]" 
                          : "border-transparent hover:border-dashed hover:border-indigo-500/30 bg-transparent"
                      }`}
                    >
                      {/* Tiny drag visual indicator */}
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-indigo-600 text-[9px] font-bold text-white px-2.5 py-0.5 rounded-full opacity-0 group-hover/overlay:opacity-100 transition whitespace-nowrap shadow-lg flex items-center gap-1 pointer-events-none">
                        <Smartphone className="w-2.5 h-2.5 animate-bounce" /> Drag &amp; Size
                      </div>
                      
                      <div key={activeCaption.text} className="pointer-events-none">
                        {customStyleSettings ? (
                          renderCustomCaptionHTML(
                            activeCaption.text,
                            customStyleSettings,
                            currentTime + globalTimeOffset,
                            activeCaption.start,
                            activeCaption.end
                          )
                        ) : (
                          <div
                            className={`${TEMPLATES.find(t => t.id === selectedTemplate)?.textClass} pointer-events-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.8)]`}
                            style={getDynamicStyle(selectedTemplate)}
                          >
                            {renderCaptionTextHTML(activeCaption.text, selectedTemplate)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Big Center Play Indicator */}
                  {!isPlaying && (
                    <div 
                      onClick={togglePlay}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer z-20 transition-opacity opacity-100"
                    >
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-full scale-110 shadow-2xl transition hover:scale-125">
                        <Play className="w-8 h-8 fill-white text-white translate-x-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Player Timeline Seek bar */}
              <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/90 space-y-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={togglePlay}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-xl transition cursor-pointer"
                    id="btn-play-pause"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-slate-200" /> : <Play className="w-4 h-4 fill-slate-200 translate-x-0.5" />}
                  </button>

                  <div className="flex-1">
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.05}
                      value={currentTime}
                      onChange={(e) => seekTo(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <span className="text-xs font-mono font-bold text-slate-400">
                    {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                  </span>
                </div>
              </div>
            </div>

            {/* Separated Caption Control Settings Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3 mt-1.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-300 border-b border-slate-800/60 pb-2">
                <Sliders className="w-4 h-4 text-pink-500" />
                <span>कैप्शन साइज और पारदर्शिता (Caption Size &amp; Opacity)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-400">
                    <span>साइज (Size):</span>
                    <span className="font-mono text-pink-400 font-black">{Math.round(captionScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    value={captionScale}
                    onChange={(e) => setCaptionScale(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-400">
                    <span>पारदर्शिता (BG Opacity):</span>
                    <span className="font-mono text-emerald-400 font-black">{captionBgOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={captionBgOpacity}
                    onChange={(e) => setCaptionBgOpacity(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 text-[10px] border-t border-slate-800/40">
                <span className="text-slate-500 font-medium">
                  * वीडियो पर कैप्शन्स को कहीं भी ड्रैग (Drag) कर सकते हैं।
                </span>
                <button 
                  onClick={() => {
                    setCaptionX(50);
                    setCaptionScale(1.0);
                    setCaptionBgOpacity(90);
                    if (selectedTemplate === "mrbeast-style") setCaptionY(35);
                    else if (selectedTemplate === "simple-white") setCaptionY(85);
                    else if (selectedTemplate === "emotional-story") setCaptionY(80);
                    else if (selectedTemplate === "reels-trending") setCaptionY(82);
                    else setCaptionY(75);
                  }}
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 py-1.5 px-3 rounded-lg font-bold transition cursor-pointer shrink-0"
                >
                  Reset Layout
                </button>
              </div>
            </div>
          </>
        )}

          {/* 3. Transcription Progress Screen */}
          {loadingStep !== "idle" && (
            <div className="p-6 bg-slate-900 border border-indigo-500/20 rounded-3xl space-y-4 shadow-2xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2.5 rounded-xl text-indigo-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {loadingStep === "extracting" ? "Extracting Audio Soundtrack" : "AI Transcribing & Timeline Aligning"}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {loadingStep === "extracting" ? "Converting video audio to optimized speech WAV..." : "Gemini 3.5 Flash modeling speech rhythms..."}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono font-bold text-slate-400">
                  <span>{loadingStep === "extracting" ? "Extraction progress" : "Transcribing speech..."}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Left Side: Control Panels & Captions Timeline (Spacious scrollable workflow on desktop) */}
        <section className="col-span-1 lg:col-span-7 lg:order-1 flex flex-col gap-5">
          {/* 1. Generator & Templates Control Hub */}
          <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Configure CC Engine</h3>
              </div>
              
              {/* Language Selection Toggles */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto">
                {(["Odia", "Hindi", "English"] as LanguageId[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setSelectedLanguage(lang);
                      setLanguageClicked(true);
                    }}
                    className={`flex-1 sm:flex-none text-xs font-bold py-1.5 px-3.5 rounded-lg transition-all ${
                      selectedLanguage === lang 
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" 
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    id={`btn-lang-${lang.toLowerCase()}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key settings panel */}
            <div className="border border-slate-800/80 bg-slate-950/40 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setShowApiSettings(true)}
                  className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-indigo-400 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0 animate-pulse" />
                  <span>Gemini API Key: {apiKey ? "🔑 Configured (सेव है)" : "❌ Not Set (क्लिक करके जोड़ें)"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowApiSettings(true)}
                  className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-[10px] font-extrabold py-1 px-3 rounded-xl border border-indigo-500/20 transition cursor-pointer"
                >
                  {apiKey ? "Change Key" : "Add Key / जोड़ें"}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-normal">
                {apiKey 
                  ? "✓ Your custom API key is stored securely in your browser's local storage for your APK." 
                  : "⚠ Running in Simulated mode. Click 'Add Key' above to insert your own Gemini key for permanent usage on Amazon Appstore/APK."}
              </p>
            </div>

            {/* API Key Settings Modal Overlay */}
            {showApiSettings && (
              <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg overflow-y-auto">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative my-4 sm:my-auto space-y-4 animate-fadeIn">
                  
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Gemini API Configurator</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowApiSettings(false)}
                      className="text-slate-400 hover:text-white transition p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Modal Guide */}
                  <div className="space-y-3 text-xs text-slate-300 leading-relaxed bg-slate-950/50 p-4 rounded-2xl border border-slate-850">
                    <p className="font-bold text-slate-200">
                      🔑 Add Key for Permanent APK Use (APK के लिए एपीआई की जोड़ें):
                    </p>
                    <p className="text-[11px] text-slate-400">
                      If you publish this APK on Amazon or other stores, this custom API Key ensures that transcription and voice translation features continue working perfectly for all your users.
                    </p>
                    <div className="text-[11px] text-slate-400 space-y-1">
                      <p>
                        1. Get a free API key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-pink-400 font-extrabold underline hover:text-pink-300">Google AI Studio</a>.
                      </p>
                      <p>
                        2. Paste the key in the field below. It is saved in local storage.
                      </p>
                    </div>
                  </div>

                  {/* Input field wrapper */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      Enter Gemini API Key
                    </label>
                    <div className="relative flex items-center bg-slate-950 border border-slate-800 focus-within:border-indigo-500 rounded-xl overflow-hidden px-3">
                      <input
                        type={showApiKeyPlain ? "text" : "password"}
                        placeholder="AIzaSy..."
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setTestStatus("idle");
                          setTestMessage("");
                        }}
                        className="flex-1 bg-transparent py-2.5 text-[12px] text-slate-100 focus:outline-none font-mono"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKeyPlain(!showApiKeyPlain)}
                        className="text-slate-400 hover:text-slate-200 px-1 text-xs font-semibold cursor-pointer"
                        title={showApiKeyPlain ? "Hide password" : "Show password"}
                      >
                        {showApiKeyPlain ? "👁️ Hide" : "🔒 Show"}
                      </button>
                    </div>
                  </div>

                  {/* Actions & Status inside Modal */}
                  <div className="space-y-3">
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={testApiKey}
                        disabled={testStatus === "testing" || !apiKey.trim()}
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/15"
                      >
                        {testStatus === "testing" ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Testing Key...</span>
                          </>
                        ) : (
                          <span>⚡ Test API Connection</span>
                        )}
                      </button>

                      {apiKey && (
                        <button
                          type="button"
                          onClick={() => {
                            setApiKey("");
                            setTestStatus("idle");
                            setTestMessage("");
                          }}
                          className="bg-slate-850 hover:bg-slate-800 text-red-400 px-4 py-2.5 rounded-xl border border-slate-800 transition text-xs font-bold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Test Status feedback */}
                    {testStatus !== "idle" && (
                      <div className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed ${
                        testStatus === "success" 
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" 
                          : testStatus === "error" 
                          ? "bg-rose-500/10 border-rose-500/25 text-rose-400"
                          : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400 animate-pulse"
                      }`}>
                        <div className="font-bold mb-0.5">
                          {testStatus === "success" && "✓ Connection Success (कनेक्शन सफल):"}
                          {testStatus === "error" && "✗ Connection Failed (कनेक्शन विफल):"}
                          {testStatus === "testing" && "⚡ Connecting..."}
                        </div>
                        <p className="text-[10px] opacity-90 leading-normal">{testMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Close & Save Button */}
                  <div className="border-t border-slate-800/80 pt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowApiSettings(false)}
                      className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition shadow-lg shadow-pink-600/15 cursor-pointer"
                    >
                      Save &amp; Close Settings
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* Generate Action Button */}
            <button
              onClick={generateAutoCaptions}
              disabled={!videoFile || loadingStep !== "idle"}
              className={`w-full flex items-center justify-center gap-2.5 font-bold py-4 px-6 rounded-2xl shadow-xl transition-all duration-300 ${
                !videoFile 
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                  : "bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-indigo-500/10 cursor-pointer"
              }`}
              id="btn-generate-caption"
            >
              <Sparkles className="w-5 h-5 animate-pulse text-yellow-300 fill-yellow-300" />
              <span>One-Click Generate Auto Captions</span>
            </button>
          </div>

          {/* 2. Viral Templates Drawer */}
          {languageClicked && (
            <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-pink-400" />
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">8 Viral Caption Templates</h3>
                </div>
                <span className="text-[10px] bg-pink-500/10 text-pink-400 font-mono font-bold py-0.5 px-2 rounded border border-pink-500/20">
                  LIVE ANIMATED PREVIEWS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {TEMPLATES.map((tmpl) => {
                  const isActive = selectedTemplate === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      onClick={() => applyTemplatePreset(tmpl.id)}
                      className={`p-3 rounded-2xl text-left border-2 transition-all flex flex-col justify-between cursor-pointer ${
                        isActive 
                          ? "bg-slate-950 border-pink-500 shadow-lg shadow-pink-500/10 scale-[1.02]" 
                          : "bg-slate-950/40 border-slate-850 hover:border-slate-800 text-slate-300"
                      }`}
                      id={`btn-tmpl-${tmpl.id}`}
                    >
                      <div className="space-y-1 w-full">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black tracking-tight block text-white truncate">{tmpl.name}</span>
                          {tmpl.id === 'mrbeast-style' && <Flame className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                          {tmpl.id === 'viral-highlights' && <Sparkles className="w-3 h-3 text-green-400 fill-green-400 shrink-0" />}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight block h-7 overflow-hidden">{tmpl.description}</p>
                        
                        {/* Interactive Visual Animation Mockup Preview Block */}
                        <div className="mt-3 bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 overflow-hidden flex items-center justify-center min-h-[56px] relative select-none">
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                          
                          {tmpl.id === 'simple-white' && (
                            <span className="text-[9px] text-white font-semibold bg-black/50 px-2 py-0.5 rounded font-sans animate-pulse">
                              ନମସ୍କାର
                            </span>
                          )}
                          {tmpl.id === 'viral-shorts' && (
                            <span className="text-[9px] text-yellow-400 font-extrabold tracking-tighter uppercase px-2 py-0.5 bg-black border border-yellow-400 rounded shadow animate-bounce">
                              SHORTS
                            </span>
                          )}
                          {tmpl.id === 'mrbeast-style' && (
                            <span className="text-[9px] text-white font-black tracking-tight uppercase bg-amber-500 border border-black shadow px-1.5 py-0.5 -rotate-3 inline-block animate-pulse">
                              BOUNCE!
                            </span>
                          )}
                          {tmpl.id === 'emotional-story' && (
                            <span className="text-[9px] text-amber-100 font-serif italic border-b border-amber-200/20 px-1 py-0.5 animate-pulse">
                              Kahani...
                            </span>
                          )}
                          {tmpl.id === 'reels-trending' && (
                            <span className="text-[8px] text-cyan-300 font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-950 border border-cyan-400/40 shadow-[0_0_8px_rgba(34,211,238,0.3)] animate-pulse">
                              REELS
                            </span>
                          )}
                          {tmpl.id === 'viral-highlights' && (
                            <div className="flex gap-1 text-[9px] font-black uppercase">
                              <span className="text-white">ଆଜି</span>
                              <span className="text-green-400 animate-bounce inline-block">ର</span>
                              <span className="text-yellow-400">ଦିନ</span>
                            </div>
                          )}
                          {tmpl.id === 'emoji-fusion' && (
                            <span className="text-[9px] text-yellow-300 font-extrabold px-1.5 py-0.5 bg-indigo-950 border border-pink-500 rounded-lg shadow animate-bounce flex items-center gap-0.5">
                              ଗୀତ <span className="text-xs animate-pulse">🎵</span>
                            </span>
                          )}
                          {tmpl.id === 'karaoke-pro' && (
                            <span className="text-[9.5px] text-white font-black px-1.5 py-0.5 bg-slate-950 border border-emerald-400 rounded-lg shadow animate-pulse flex items-center gap-1">
                              <span className="text-emerald-400">ସ୍ୱର</span> <span>ଶବ୍ଦ</span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-3 flex justify-end w-full">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isActive ? "bg-pink-500/10 text-pink-400" : "bg-slate-800 text-slate-500"
                        }`}>
                          {isActive ? "ACTIVE" : "SELECT"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}


          {/* Subtitle Animation & Font Settings */}
          <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 space-y-5 shadow-xl">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
              <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
              <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                Subtitle Animation &amp; Font Settings
              </h3>
            </div>

            {/* 1. Odia & English Font Selector & Local Upload */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  1. Font Choice (ଫଣ୍ଟ ଚୟନ)
                </span>
                
                {/* Upload Local Font label trigger button */}
                <label className="text-[10px] font-black bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-full cursor-pointer transition flex items-center gap-1">
                  <span>+ Upload Local Font</span>
                  <input
                    type="file"
                    accept=".ttf,.otf"
                    onChange={handleLocalFontUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Font Selector dropdown */}
                <div className="col-span-2">
                  <select
                    value={customStyleSettings.fontFamily}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, fontFamily: e.target.value }))}
                    className="w-full bg-slate-950 text-xs font-semibold text-slate-200 py-2.5 px-3 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 font-sans"
                  >
                    <optgroup label="Odia Optimized Fonts">
                      <option value="Noto Sans Odia">Noto Sans Odia (Clean)</option>
                      <option value="Noto Serif Odia">Noto Serif Odia (Serif)</option>
                      <option value="Baloo Bhaina 2">Baloo Bhaina 2 (Rounded/Bold)</option>
                      <option value="Mukta">Mukta (Punchy Display)</option>
                      <option value="Hind">Hind (Clear Slate)</option>
                    </optgroup>
                    <optgroup label="English Fonts">
                      <option value="Poppins">Poppins (Modern Geometric)</option>
                      <option value="Roboto">Roboto (Symmetrical Tech)</option>
                      <option value="Inter">Inter (Swiss Sans)</option>
                      <option value="Space Grotesk">Space Grotesk (Neo-Brutalist)</option>
                      <option value="Outfit">Outfit (Clean Elegant)</option>
                      <option value="Playfair Display">Playfair Display (Editorial Serif)</option>
                    </optgroup>
                    {uploadedFonts.length > 0 && (
                      <optgroup label="Uploaded Local Fonts">
                        {uploadedFonts.map(font => (
                          <option key={font} value={font}>{font}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* Font Size & Weight */}
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">Font Size (px)</label>
                  <input
                    type="number"
                    min={12}
                    max={60}
                    value={customStyleSettings.fontSize}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) || 20 }))}
                    className="w-full bg-slate-950 text-xs font-bold text-slate-200 py-2 px-3 rounded-xl border border-slate-800 text-center font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">Font Weight</label>
                  <select
                    value={customStyleSettings.fontWeight}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, fontWeight: e.target.value }))}
                    className="w-full bg-slate-950 text-xs font-bold text-slate-200 py-2 px-2.5 rounded-xl border border-slate-800"
                  >
                    <option value="400">Regular (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">SemiBold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">ExtraBold (800)</option>
                    <option value="900">Black (900)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Color & Border Settings */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                2. Colors, Outline &amp; Shadows
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                {/* Font Color */}
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 font-bold mb-1">Font Color</span>
                  <input
                    type="color"
                    value={customStyleSettings.fontColor}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, fontColor: e.target.value }))}
                    className="w-8 h-8 rounded-full border-none cursor-pointer bg-transparent overflow-hidden"
                  />
                  <span className="text-[9px] font-mono mt-1 text-slate-300">{customStyleSettings.fontColor}</span>
                </div>

                {/* Outline Color */}
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 font-bold mb-1">Outline Color</span>
                  <input
                    type="color"
                    value={customStyleSettings.outlineColor}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, outlineColor: e.target.value }))}
                    className="w-8 h-8 rounded-full border-none cursor-pointer bg-transparent overflow-hidden"
                  />
                  <span className="text-[9px] font-mono mt-1 text-slate-300">{customStyleSettings.outlineColor}</span>
                </div>

                {/* Shadow Color */}
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 font-bold mb-1">Shadow Color</span>
                  <input
                    type="color"
                    value={customStyleSettings.shadowColor.startsWith("rgba") ? "#000000" : customStyleSettings.shadowColor}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, shadowColor: e.target.value }))}
                    className="w-8 h-8 rounded-full border-none cursor-pointer bg-transparent overflow-hidden"
                  />
                  <span className="text-[9px] font-mono mt-1 text-slate-300">Shadow</span>
                </div>
              </div>

              {/* Sliders for Outline & Shadow Intensity */}
              <div className="grid grid-cols-2 gap-4 pt-1.5">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                    <span>Outline Width</span>
                    <span className="text-slate-300 font-mono">{customStyleSettings.outlineWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    value={customStyleSettings.outlineWidth}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, outlineWidth: parseInt(e.target.value) }))}
                    className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                    <span>Shadow Blur</span>
                    <span className="text-slate-300 font-mono">{customStyleSettings.shadowBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={customStyleSettings.shadowBlur}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, shadowBlur: parseInt(e.target.value) }))}
                    className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 3. Background Box & Transparency */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-850 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  3. Background Box (ପଛପଟ ବାକ୍ସ)
                </span>
                <button
                  type="button"
                  onClick={() => setCustomStyleSettings(prev => ({ ...prev, hasBackgroundBox: !prev.hasBackgroundBox }))}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition ${
                    customStyleSettings.hasBackgroundBox 
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" 
                      : "bg-slate-900 border-slate-800 text-slate-500"
                  }`}
                >
                  {customStyleSettings.hasBackgroundBox ? "Enabled" : "Disabled"}
                </button>
              </div>

              {customStyleSettings.hasBackgroundBox && (
                <div className="grid grid-cols-2 gap-4 pt-1 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customStyleSettings.backgroundBoxColor}
                      onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, backgroundBoxColor: e.target.value }))}
                      className="w-7 h-7 rounded border-none cursor-pointer bg-transparent overflow-hidden"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">{customStyleSettings.backgroundBoxColor}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-bold mb-1">
                      <span>Opacity</span>
                      <span className="text-slate-300 font-mono">{customStyleSettings.backgroundOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={customStyleSettings.backgroundOpacity}
                      onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, backgroundOpacity: parseInt(e.target.value) }))}
                      className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. Text Spacing, Alignment & Margin Boundaries */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                4. Layout &amp; Safe Margins
              </span>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCustomStyleSettings(prev => ({ ...prev, textAlignment: "left" }))}
                  className={`text-[10px] font-bold py-1.5 rounded-lg border transition ${
                    customStyleSettings.textAlignment === "left"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Align Left
                </button>
                <button
                  type="button"
                  onClick={() => setCustomStyleSettings(prev => ({ ...prev, textAlignment: "center" }))}
                  className={`text-[10px] font-bold py-1.5 rounded-lg border transition ${
                    customStyleSettings.textAlignment === "center"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Align Center
                </button>
                <button
                  type="button"
                  onClick={() => setCustomStyleSettings(prev => ({ ...prev, textAlignment: "right" }))}
                  className={`text-[10px] font-bold py-1.5 rounded-lg border transition ${
                    customStyleSettings.textAlignment === "right"
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Align Right
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                    <span>Line Spacing</span>
                    <span className="text-slate-300 font-mono">{customStyleSettings.lineSpacing}x</span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={2.0}
                    step={0.05}
                    value={customStyleSettings.lineSpacing}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, lineSpacing: parseFloat(e.target.value) }))}
                    className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                    <span>Letter Spacing</span>
                    <span className="text-slate-300 font-mono">{customStyleSettings.letterSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min={-2}
                    max={10}
                    step={1}
                    value={customStyleSettings.letterSpacing}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, letterSpacing: parseInt(e.target.value) }))}
                    className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Bottom Margin and Safe Area Boundary Checkbox */}
              <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-850/60 space-y-2.5">
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold">
                  <span>Bottom Margin Offset</span>
                  <span className="text-indigo-400 font-mono font-extrabold">{customStyleSettings.bottomMargin}px</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={250}
                  value={customStyleSettings.bottomMargin}
                  onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, bottomMargin: parseInt(e.target.value) }))}
                  className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                />

                <div className="flex items-center justify-between pt-1 border-t border-slate-850/40">
                  <span className="text-[10px] font-bold text-slate-400">Reels UI Safe Boundaries</span>
                  <input
                    type="checkbox"
                    checked={customStyleSettings.safeAreaEnabled}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, safeAreaEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* 5. Subtitle Animation & Tuning (60 FPS Performance) */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                5. High FPS Subtitle Animations
              </span>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-bold block">Animation Style</label>
                <select
                  value={customStyleSettings.animationStyle}
                  onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, animationStyle: e.target.value }))}
                  className="w-full bg-slate-950 text-xs font-bold text-slate-200 py-2.5 px-3 rounded-xl border border-slate-800"
                >
                  <option value="None">None (Static)</option>
                  <option value="Word by Word">Word by Word (Karaoke-Fill)</option>
                  <option value="Popping Word by Word">Popping Word by Word (Social Punchy)</option>
                  <option value="Active Word">Active Word (Highlight)</option>
                  <option value="Active Word Zoom">Active Word Zoom (Super-Viral)</option>
                  <option value="Fade In">Fade In (Smooth Enter)</option>
                  <option value="Fade Out">Fade Out (Exit Blend)</option>
                  <option value="Letter by Letter">Letter by Letter (Typewriter)</option>
                  <option value="Popping Words">Popping Words (Elastic Pop)</option>
                  <option value="Popping Lines">Popping Lines (Line-by-Line Bounce)</option>
                  <option value="Line by Line">Line by Line (Classic Scroll)</option>
                  <option value="Expanding Lines">Expanding Lines (Center Grow)</option>
                  <option value="Falling Lines">Falling Lines (Gravity drop)</option>
                  <option value="Shake">Shake (High Intensity / Meme Style)</option>
                  <option value="Zoom">Zoom (Cinematic Scale)</option>
                </select>
              </div>

              {/* Animation Speed, Intensity, Duration controls */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                    <span>Speed Factor</span>
                    <span className="text-slate-300 font-mono">{customStyleSettings.animationSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={3.0}
                    step={0.05}
                    value={customStyleSettings.animationSpeed}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, animationSpeed: parseFloat(e.target.value) }))}
                    className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                    <span>Intensity</span>
                    <span className="text-slate-300 font-mono">{customStyleSettings.animationIntensity}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={customStyleSettings.animationIntensity}
                    onChange={(e) => setCustomStyleSettings(prev => ({ ...prev, animationIntensity: parseInt(e.target.value) }))}
                    className="w-full accent-indigo-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 6. Calibration Sync Alignment Offset (FIXES ISSUE #2 PERFECTLY) */}
            <div className="p-3.5 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-indigo-400">
                <Sparkles className="w-3.5 h-3.5 text-indigo-300 animate-spin" />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">
                  Vocal Timing Synchronizer
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                If the caption text is not perfectly matching the speaker&apos;s speech vocals, adjust this timing offset slider to calibrate them instantly!
              </p>
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1.5">
                  <span>Caption Timing Shift</span>
                  <span className={`font-mono font-black ${globalTimeOffset < 0 ? "text-pink-400" : "text-emerald-400"}`}>
                    {globalTimeOffset === 0 ? "Perfectly Sycned (0.00s)" : `${globalTimeOffset > 0 ? "+" : ""}${globalTimeOffset.toFixed(2)}s`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-2.0}
                  max={2.0}
                  step={0.05}
                  value={globalTimeOffset}
                  onChange={(e) => setGlobalTimeOffset(parseFloat(e.target.value))}
                  className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>


          {/* 3. Subtitles Timelines Manager / Editor */}
          <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl flex-1 flex flex-col min-h-[300px]">
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Subtitles Timeline</h3>
                {captions.length > 0 && (
                  <span className="text-[10px] bg-slate-800 font-mono font-bold text-slate-300 py-0.5 px-2 rounded-full border border-slate-700">
                    {captions.length} phrases
                  </span>
                )}
              </div>

              {videoUrl && (
                <button
                  onClick={addCaption}
                  className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold py-1.5 px-3 rounded-full flex items-center gap-1 transition"
                  id="btn-add-caption"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Subtitle
                </button>
              )}
            </div>

            {/* Captions List Scroller */}
            <div 
              ref={captionListRef}
              className="p-4 overflow-y-auto space-y-3 max-h-[360px] flex-1"
              id="captions-scroller"
            >
              {captions.length === 0 ? (
                <div className="text-center py-14 px-4 text-slate-500 space-y-2">
                  <FileText className="w-8 h-8 mx-auto stroke-[1.5] opacity-55" />
                  <p className="text-xs font-medium">No Captions Loaded</p>
                  <p className="text-[11px] max-w-[260px] mx-auto leading-relaxed">
                    Upload a video and tap &ldquo;One-Click Generate Auto Captions&rdquo; above to start transcription.
                  </p>
                </div>
              ) : (
                captions.map((caption, index) => {
                  const isActive = (currentTime + globalTimeOffset) >= caption.start && (currentTime + globalTimeOffset) <= caption.end;
                  return (
                    <div
                      key={index}
                      id={`caption-card-${index}`}
                      className={`p-3.5 rounded-2xl border-2 transition-all space-y-3 ${
                        isActive 
                          ? "bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-500/5" 
                          : "bg-slate-950/30 border-slate-850"
                      }`}
                    >
                      {/* Timeline sliders and input fields */}
                      <div className="flex items-center gap-3 justify-between">
                        <span className="text-[10px] font-mono font-black text-slate-500">
                          #{String(index + 1).padStart(2, '0')}
                        </span>

                        <div className="flex items-center gap-1.5 flex-1 max-w-[220px]">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">Start:</span>
                          <input 
                            type="number"
                            step={0.1}
                            value={caption.start}
                            onChange={(e) => updateCaptionTimes(index, parseFloat(e.target.value) || 0, caption.end)}
                            className="bg-slate-900 border border-slate-800 text-xs text-slate-200 py-1 px-2 rounded-lg w-16 text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-[10px] font-mono text-slate-400 font-bold ml-1.5">End:</span>
                          <input 
                            type="number"
                            step={0.1}
                            value={caption.end}
                            onChange={(e) => updateCaptionTimes(index, caption.start, parseFloat(e.target.value) || 0)}
                            className="bg-slate-900 border border-slate-800 text-xs text-slate-200 py-1 px-2 rounded-lg w-16 text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => seekTo(caption.start)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-750 rounded-lg text-xs font-bold text-slate-300 transition"
                            title="Seek video to start time"
                            id={`btn-seek-${index}`}
                          >
                            <Play className="w-3 h-3 fill-slate-300 translate-x-0.2" />
                          </button>
                          <button
                            onClick={() => deleteCaption(index)}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition"
                            title="Delete Subtitle"
                            id={`btn-delete-${index}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Caption word text input */}
                      <input
                        type="text"
                        value={caption.text}
                        onChange={(e) => updateCaptionText(index, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-xs md:text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                      />

                      {/* Separate Option: Individual Subtitle Voiceover Toolbar */}
                      <div className="flex items-center justify-between border-t border-slate-800/50 pt-2.5 mt-1">
                        <span className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                          <Volume2 className="w-3 h-3 text-pink-400" /> Segment Voice
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => generateAndPlaySingleCaption(index)}
                            disabled={loadingSingleIndices[index]}
                            className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                              singleCaptionVoiceUrls[index]
                                ? singlePlayingIndices[index]
                                  ? "bg-pink-600/20 border-pink-500 text-pink-400"
                                  : "bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                            }`}
                          >
                            {loadingSingleIndices[index] ? (
                              <Loader2 className="w-3 h-3 animate-spin text-pink-500" />
                            ) : singleCaptionVoiceUrls[index] ? (
                              singlePlayingIndices[index] ? (
                                <>
                                  <Pause className="w-2.5 h-2.5 fill-pink-400" />
                                  <span>Pause Voice</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-2.5 h-2.5 fill-indigo-400" />
                                  <span>Play Voice</span>
                                </>
                              )
                            ) : (
                              <>
                                <Sparkles className="w-2.5 h-2.5 text-yellow-300 animate-pulse" />
                                <span>Generate AI Voice</span>
                              </>
                            )}
                          </button>

                          {singleCaptionVoiceUrls[index] && (
                            <button
                              type="button"
                              onClick={() => downloadSingleCaptionWav(index)}
                              className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition flex items-center gap-1 cursor-pointer"
                              title="Download single voice segment as WAV"
                            >
                              <DownloadIcon className="w-3 h-3 text-slate-400" />
                              <span>WAV</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Export and Action Panel */}
            {captions.length > 0 && (
              <div className="p-4 bg-slate-900/90 border-t border-slate-800 space-y-4">
                {/* Burn Captions onto MP4 video component */}
                <VideoExporter
                  videoFile={videoFile}
                  videoUrl={videoUrl}
                  captions={captions}
                  selectedTemplate={selectedTemplate}
                  captionX={captionX}
                  captionY={captionY}
                  captionScale={captionScale}
                  captionBgOpacity={captionBgOpacity}
                  aspectRatio={aspectRatio}
                  settings={customStyleSettings}
                  globalTimeOffset={globalTimeOffset}
                />

                {/* Caption Project Export Card */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Caption Project Export
                    </span>
                    <button
                      onClick={handleCopyAllCaptions}
                      className="flex items-center gap-1.5 text-[10px] md:text-xs font-semibold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 px-2.5 py-1.5 rounded-lg transition border border-indigo-500/20"
                      id="btn-copy-captions"
                    >
                      {copiedCaptions ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy All Captions
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Export your generated captions separately in standard subtitle/text formats:
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handleExportSRT}
                      className="flex flex-col items-center justify-center gap-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 py-2.5 px-2 rounded-xl font-semibold transition border border-slate-700/50"
                      id="btn-export-srt"
                      title="Download standard SubRip Subtitle format (.srt)"
                    >
                      <DownloadIcon className="w-4 h-4 text-pink-400" />
                      <span className="text-[10px] font-bold">Subtitles (SRT)</span>
                    </button>

                    <button
                      onClick={handleExportTXT}
                      className="flex flex-col items-center justify-center gap-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 py-2.5 px-2 rounded-xl font-semibold transition border border-slate-700/50"
                      id="btn-export-txt"
                      title="Download clean text transcript with timestamps (.txt)"
                    >
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="text-[10px] font-bold">Transcript (TXT)</span>
                    </button>

                    <button
                      onClick={handleExportJSON}
                      className="flex flex-col items-center justify-center gap-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 py-2.5 px-2 rounded-xl font-semibold transition border border-slate-700/50"
                      id="btn-export-json"
                      title="Download JSON structure with captions & high-precision timestamps (.json)"
                    >
                      <span className="text-xs font-bold text-sky-400 font-mono">{"{ }"}</span>
                      <span className="text-[10px] font-bold">Data (JSON)</span>
                    </button>
                  </div>

                  <div className="bg-amber-950/20 border border-amber-500/25 rounded-xl p-3 text-[10px] text-amber-300 space-y-1 mt-1">
                    <span className="font-extrabold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      महत्वपूर्ण सूचना (Important Notice):
                    </span>
                    <p className="leading-relaxed">
                      ये बटन केवल सबटाइटल/टेक्स्ट फ़ाइल डाउनलोड करते हैं। वीडियो डाउनलोड करने के लिए ऊपर दिए गए <strong>"Generate &amp; Download"</strong> बटन का उपयोग करें।
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        </>
        )}
      </main>
    </div>
  );
}
