import React, { useState, useRef, useEffect } from "react";
import { Caption, TemplateId, CustomStyleSettings } from "../types";
import { drawCaptionOnCanvas, drawCustomCaptionOnCanvas } from "../utils/canvasRenderer";
import { captionsToSRT, captionsToTXT, downloadFile } from "../utils/captionExporter";
import { Download, Film, Loader2, Sparkles, Check, AlertCircle, RefreshCw, Layers, Copy } from "lucide-react";

interface VideoExporterProps {
  videoFile: File | null;
  videoUrl: string;
  captions: Caption[];
  selectedTemplate: TemplateId;
  captionX?: number;
  captionY?: number;
  captionScale?: number;
  captionBgOpacity?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5" | "original";
  aiVoiceUrl?: string; // High-fidelity compiled timeline-aligned AI vocal track URL
  settings?: CustomStyleSettings;
  globalTimeOffset?: number;
}

export default function VideoExporter({
  videoFile,
  videoUrl,
  captions,
  selectedTemplate,
  captionX = 50,
  captionY = 75,
  captionScale = 1.0,
  captionBgOpacity = 90,
  aspectRatio = "original",
  aiVoiceUrl,
  settings,
  globalTimeOffset = 0,
}: VideoExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isConvertingToMp4, setIsConvertingToMp4] = useState(false);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportedVideoFilename, setExportedVideoFilename] = useState<string>("");
  const [videoName, setVideoName] = useState<string>("");

  const [copiedSRT, setCopiedSRT] = useState(false);
  const [copiedTXT, setCopiedTXT] = useState(false);
  const [copiedVideoUrl, setCopiedVideoUrl] = useState(false);

  const copyVideoUrlToClipboard = () => {
    if (!exportedVideoUrl) return;
    const absoluteUrl = exportedVideoUrl.startsWith("http")
      ? exportedVideoUrl
      : window.location.origin + exportedVideoUrl;
    navigator.clipboard.writeText(absoluteUrl).then(() => {
      setCopiedVideoUrl(true);
      setTimeout(() => setCopiedVideoUrl(false), 2005);
    }).catch(err => {
      console.error("Failed to copy video URL: ", err);
    });
  };

  const copySRTToClipboard = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const srtContent = captionsToSRT(calibrated);
    navigator.clipboard.writeText(srtContent).then(() => {
      setCopiedSRT(true);
      setTimeout(() => setCopiedSRT(false), 2005);
    }).catch(err => {
      console.error("Failed to copy SRT: ", err);
    });
  };

  const copyTXTToClipboard = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const txtContent = captionsToTXT(calibrated);
    navigator.clipboard.writeText(txtContent).then(() => {
      setCopiedTXT(true);
      setTimeout(() => setCopiedTXT(false), 2005);
    }).catch(err => {
      console.error("Failed to copy TXT: ", err);
    });
  };

  // Export Settings (Speed is locked to 1.0x to preserve length, timings, and vocal tone)
  const [resolution, setResolution] = useState<"original" | "1080p" | "2k" | "4k">("original");
  const [includeVoiceover, setIncludeVoiceover] = useState(false);

  const exportVideoRef = useRef<HTMLVideoElement | null>(null);
  const exportVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const getCalibratedCaptions = () => {
    return captions.map(c => ({
      ...c,
      start: Math.max(0, parseFloat((c.start - globalTimeOffset).toFixed(3))),
      end: Math.max(0.1, parseFloat((c.end - globalTimeOffset).toFixed(3))),
    }));
  };

  const downloadSRT = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const srtContent = captionsToSRT(calibrated);
    const baseName = videoName.trim() ? videoName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "") : "odia_viral_captions";
    downloadFile(srtContent, `${baseName}.srt`, "text/srt");
  };

  const downloadTXT = () => {
    if (captions.length === 0) return;
    const calibrated = getCalibratedCaptions();
    const txtContent = captionsToTXT(calibrated);
    const baseName = videoName.trim() ? videoName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "") : "odia_viral_captions";
    downloadFile(txtContent, `${baseName}.txt`, "text/plain");
  };

  const handleExport = async () => {
    if (!videoUrl || !videoFile) {
      setExportError("Please upload a video first. (कृपया पहले एक वीडियो अपलोड करें।)");
      return;
    }

    // Initialize AudioContext immediately inside the direct user-click event handler
    // This guarantees the browser considers it a valid user action and unblocks unmuted audio!
    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      // Resume immediately while user gesture is 100% active
      await audioCtx.resume().catch(() => {});
    } catch (e) {
      console.warn("[Export] AudioContext pre-creation failed:", e);
    }

    if (exportedVideoUrl) {
      try {
        URL.revokeObjectURL(exportedVideoUrl);
      } catch (err) {
        console.warn("[Export] Error revoking previous object URL:", err);
      }
      setExportedVideoUrl(null);
      setExportedVideoFilename("");
    }

    setIsExporting(true);
    setProgress(0);
    setExportComplete(false);
    setExportError(null);

    // Wait a brief moment for React to mount the #export-preview-box element in the DOM
    await new Promise((resolve) => setTimeout(resolve, 100));

    const cleanupDom = () => {
      const el = document.getElementById("export-temp-container");
      if (el) {
        el.remove();
      }
    };

    // Clean up any stale leftovers first
    cleanupDom();

    try {
      // Create rendering elements
      const video = document.createElement("video");
      video.muted = false;
      video.playsInline = true;
      video.style.position = "absolute";
      video.style.top = "0";
      video.style.left = "0";
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "contain";
      video.style.opacity = "1";
      video.style.pointerEvents = "none";
      video.style.zIndex = "1";
      exportVideoRef.current = video;

      // Find preview box to render into
      const previewBox = document.getElementById("export-preview-box");

      // Create DOM container to keep elements active and prevent tab background throttling
      const container = document.createElement("div");
      container.id = "export-temp-container";
      
      if (previewBox) {
        container.style.position = "absolute";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.overflow = "hidden";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.backgroundColor = "#000";
        previewBox.appendChild(container);
      } else {
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "480px";
        container.style.height = "270px";
        container.style.opacity = "0.01";
        container.style.pointerEvents = "none";
        container.style.zIndex = "-999999";
        container.style.overflow = "hidden";
        document.body.appendChild(container);
      }

      container.appendChild(video);

      // Wait for video to be ready to play
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 3) {
          resolve();
          return;
        }
        
        const onCanPlay = () => {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("loadedmetadata", onCanPlay);
          resolve();
        };
        
        const onError = (e: any) => {
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("loadedmetadata", onCanPlay);
          console.error("[Export] Video error during load:", e);
          reject(new Error("Failed to load video file. Please ensure it is a valid, uncorrupted MP4/WebM file."));
        };

        video.addEventListener("canplay", onCanPlay);
        video.addEventListener("loadedmetadata", onCanPlay);
        video.addEventListener("error", onError);

        // Disabling crossOrigin setting on local blob: URLs prevents security and CORS loading blocks
        if (!videoUrl.startsWith("blob:")) {
          video.crossOrigin = "anonymous";
        }
        video.src = videoUrl;
        video.load();
      });

      // Detect original video dimensions and calculate custom target aspect ratio
      const origW = video.videoWidth || 720;
      const origH = video.videoHeight || 1280;
      
      let targetRatio = origW / origH;
      if (aspectRatio === "9:16") {
        targetRatio = 9 / 16;
      } else if (aspectRatio === "16:9") {
        targetRatio = 16 / 9;
      } else if (aspectRatio === "1:1") {
        targetRatio = 1.0;
      } else if (aspectRatio === "4:5") {
        targetRatio = 4 / 5;
      }

      // Set output canvas size based on Selected Resolution (capped for social media and performance)
      let exportW = origW;
      let exportH = origH;

      // Determine standard bounding box size based on resolution selection
      let maxDim = Math.max(origW, origH);
      if (resolution === "1080p" || resolution === "2k" || resolution === "4k") {
        maxDim = 1920; // 1920px is the high-performance HD standard (social media default)
      } else {
        maxDim = Math.min(1920, Math.max(origW, origH)); // Cap original if it's excessively large to avoid browser crash
      }

      // Calculate even dimensions aligned with the target aspect ratio
      if (targetRatio > 1) {
        exportW = maxDim;
        exportH = Math.round(maxDim / targetRatio);
      } else {
        exportH = maxDim;
        exportW = Math.round(maxDim * targetRatio);
      }

      // CRITICAL: Ensure dimensions are even (even widths & heights are strictly required by browser H.264/MP4/WebM hardware encoders)
      if (exportW % 2 !== 0) exportW--;
      if (exportH % 2 !== 0) exportH--;

      console.log(`[Export] Final compiled canvas resolution: ${exportW}x${exportH} (Ratio: ${aspectRatio}, Res: ${resolution})`);

      // Set up canvas
      const canvas = document.createElement("canvas");
      canvas.width = exportW;
      canvas.height = exportH;
      canvasRef.current = canvas;
      
      // Scale canvas dynamically to fit the visual preview box smoothly
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      canvas.style.zIndex = "10";
      
      container.appendChild(canvas);
      
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas 2D context");
      
      // Enable high fidelity image smoothing for upscale/rescale
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Set up Web Audio API to capture original audio track
      let audioTrack: MediaStreamTrack | null = null;
      let voiceAudio: HTMLAudioElement | null = null;

      if (aiVoiceUrl && includeVoiceover) {
        voiceAudio = document.createElement("audio");
        voiceAudio.src = aiVoiceUrl;
        voiceAudio.crossOrigin = "anonymous";
        exportVoiceAudioRef.current = voiceAudio;
        voiceAudio.load();
      }
      
      if (audioCtx) {
        try {
          const source = audioCtx.createMediaElementSource(video);
          const destination = audioCtx.createMediaStreamDestination();
          
          // Connect video source with smart audio ducking (lowers background slightly if vocal overlay is present and enabled)
          const videoGainNode = audioCtx.createGain();
          videoGainNode.gain.value = (aiVoiceUrl && includeVoiceover) ? 0.35 : 1.0;
          source.connect(videoGainNode);
          videoGainNode.connect(destination);
          
          // Connect to the actual speakers via a silent GainNode.
          // This ensures Chrome's Web Audio graph is kept active and pulling audio frames,
          // without blasting double sound or echoes to the user during compilation!
          const silenceGain = audioCtx.createGain();
          silenceGain.gain.value = 0;
          source.connect(silenceGain);
          silenceGain.connect(audioCtx.destination);

          // Mix in the timeline-synchronized AI voice track if present
          if (voiceAudio) {
            const voiceSource = audioCtx.createMediaElementSource(voiceAudio);
            const voiceGainNode = audioCtx.createGain();
            voiceGainNode.gain.value = 1.0; // Keep AI Voiceover crisp & clear at full volume
            voiceSource.connect(voiceGainNode);
            voiceGainNode.connect(destination);
            
            voiceSource.connect(silenceGain); // keep silent monitor active
          }
          
          audioTrack = destination.stream.getAudioTracks()[0] || null;
        } catch (audioErr: any) {
          console.warn("[Export] Web Audio source hook failed. Falling back to canvas audio stream:", audioErr.message);
          // Fallback: capture original audio tracks if already in stream
          try {
            const stream = (video as any).captureStream ? (video as any).captureStream() : ((video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null);
            if (stream) {
              audioTrack = stream.getAudioTracks()[0] || null;
            }
          } catch (fallbackErr: any) {
            console.warn("[Export] Stream fallback failed:", fallbackErr.message);
          }
        }
      }

      // Start canvas stream at 30 FPS with browser compatibility check (Safari fallback)
      const captureStreamFn = (canvas as any).captureStream || (canvas as any).webkitCaptureStream;
      if (!captureStreamFn) {
        throw new Error("Your browser does not support recording HTML Canvas streams. Please try on Google Chrome, Firefox, or modern Safari.");
      }
      const canvasStream = captureStreamFn.call(canvas, 30);
      
      if (audioTrack) {
        canvasStream.addTrack(audioTrack);
      }

      // Detect supported mime types for high fidelity recording (prefer highly compatible MP4 H.264, then WebM)
      let mimeType = "";
      const candidates = [
        "video/mp4;codecs=h264,aac",
        "video/mp4;codecs=h264",
        "video/mp4;codecs=avc1",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4"
      ];

      for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }
      if (!mimeType) mimeType = "video/webm";

      console.log(`[Export] Using container/codec MIME type: ${mimeType}`);

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      
      // Cascade-try block to safely initialize MediaRecorder with safe high bitrate fallbacks
      try {
        recorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: 18000000, // 18 Megabits for absolute original-like crisp cinema quality
        });
      } catch (e1) {
        console.warn("[Export] MediaRecorder with 18Mbps failed, trying 8Mbps:", e1);
        try {
          recorder = new MediaRecorder(canvasStream, {
            mimeType,
            videoBitsPerSecond: 8000000, // 8 Megabits
          });
        } catch (e2) {
          console.warn("[Export] MediaRecorder with 8Mbps failed, trying browser default bitrate:", e2);
          recorder = new MediaRecorder(canvasStream);
        }
      }
      
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setIsConvertingToMp4(true);
        try {
          const resultBlob = new Blob(chunks, { type: mimeType });
          
          // Read the WebM blob as a base64 string to send to the server
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              if (typeof reader.result === "string") {
                const base64data = reader.result.split(",")[1];
                resolve(base64data);
              } else {
                reject(new Error("Failed to read video blob as base64 string."));
              }
            };
            reader.onerror = () => reject(new Error("FileReader failed."));
          });
          reader.readAsDataURL(resultBlob);
          const videoBase64 = await base64Promise;

          console.log("[Export] Sending WebM blob to server for high-compatibility MP4 transcode...");
          
          let cleanBaseName = videoName.trim()
            ? videoName.trim().replace(/[^a-zA-Z0-9_\-\s\.]/g, "")
            : `odia_viral_captions_${resolution}_${Date.now()}`;
          
          // Force .mp4 at the end so it's a valid video file
          if (!cleanBaseName.toLowerCase().endsWith(".mp4")) {
            cleanBaseName += ".mp4";
          }
          const outputName = cleanBaseName;
          
          const response = await fetch("/api/transcode", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              videoBase64,
              filename: outputName,
            }),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || "Server-side MP4 transcoding failed.");
          }

          const resData = await response.json();
          if (!resData.success || !resData.downloadUrl) {
            throw new Error(resData.error || "Failed to receive transcode download path.");
          }

          const downloadUrl = resData.downloadUrl;

          // Save to state for manual click fallback and future retrieval
          setExportedVideoUrl(downloadUrl);
          setExportedVideoFilename(outputName);

          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = outputName;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
          }, 150);

        } catch (transcodeErr: any) {
          console.warn("[Export] Server transcode failed or timed out. Falling back to direct WebM download:", transcodeErr.message);
          
          // Fallback: Directly download the recorded WebM file so user doesn't lose anything
          let cleanFallbackName = videoName.trim()
            ? videoName.trim().replace(/[^a-zA-Z0-9_\-\s\.]/g, "")
            : `odia_viral_captions_${resolution}_${Date.now()}`;
          
          const fileExt = mimeType.includes("mp4") ? "mp4" : "webm";
          if (!cleanFallbackName.toLowerCase().endsWith(`.${fileExt}`)) {
            if (cleanFallbackName.toLowerCase().endsWith(".mp4") && fileExt === "webm") {
              cleanFallbackName = cleanFallbackName.substring(0, cleanFallbackName.length - 4);
            }
            cleanFallbackName += `.${fileExt}`;
          }
          const outputName = cleanFallbackName;
          const resultBlob = new Blob(chunks, { type: mimeType });
          const downloadUrl = URL.createObjectURL(resultBlob);

          // Save WebM to state so the user can manually click to download if the pop-up/auto-download is blocked
          setExportedVideoUrl(downloadUrl);
          setExportedVideoFilename(outputName);

          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = outputName;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
          }, 150);
        } finally {
          setIsConvertingToMp4(false);
          
          if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
          }

          setExportComplete(true);
          setIsExporting(false);
          cleanupDom(); // Clean up temporary DOM nodes on completion
        }
      };

      // Set up drawing tick
      const renderLoop = () => {
        if (video.paused || video.ended) {
          return;
        }

        const currentTime = video.currentTime;
        const duration = video.duration || 1;

        // Force-stop recording when the video reaches its duration to prevent hanging/longer length
        if (currentTime >= duration - 0.05) {
          if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
          }
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          setProgress(100);
          return;
        }

        // Draw current video frame to canvas on every single animation frame tick
        // To support dynamic aspect ratio conversion, calculate crop bounds to fit exportW/exportH (object-fit: cover)
        const vW = video.videoWidth || 720;
        const vH = video.videoHeight || 1280;
        
        let sX = 0, sY = 0, sW = vW, sH = vH;
        const videoRatio = vW / vH;
        const canvasRatio = exportW / exportH;
        
        if (videoRatio > canvasRatio) {
          // Video is wider than canvas -> crop left/right sides
          sW = vH * canvasRatio;
          sX = (vW - sW) / 2;
        } else {
          // Video is taller than canvas -> crop top/bottom
          sH = vW / canvasRatio;
          sY = (vH - sH) / 2;
        }

        ctx.drawImage(video, sX, sY, sW, sH, 0, 0, exportW, exportH);

        // Find active caption (adjusting search with global timing offset)
        const activeCaption = captions.find(
          (c) => (currentTime + globalTimeOffset) >= c.start && (currentTime + globalTimeOffset) <= c.end
        );

        if (activeCaption) {
          if (settings) {
            drawCustomCaptionOnCanvas({
              ctx,
              text: activeCaption.text,
              width: exportW,
              height: exportH,
              currentTime,
              captionX,
              captionY,
              captionScale,
              start: activeCaption.start,
              end: activeCaption.end,
              settings,
            });
          } else {
            drawCaptionOnCanvas({
              ctx,
              text: activeCaption.text,
              width: exportW,
              height: exportH,
              templateId: selectedTemplate,
              currentTime,
              captionX,
              captionY,
              captionScale,
              captionBgOpacity,
              start: activeCaption.start,
              end: activeCaption.end,
            });
          }
        }

        // Calculate progress
        const currentProgress = Math.min(
          99,
          Math.round((currentTime / duration) * 100)
        );
        setProgress(currentProgress);

        animationFrameId.current = requestAnimationFrame(renderLoop);
      };

      video.onplay = () => {
        if (voiceAudio) {
          voiceAudio.currentTime = video.currentTime;
          voiceAudio.play().catch(() => {});
        }
        renderLoop();
      };

      video.onpause = () => {
        if (voiceAudio) {
          voiceAudio.pause();
        }
      };

      video.onended = () => {
        if (voiceAudio) {
          voiceAudio.pause();
        }
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
        setProgress(100);
      };

      // Force 1.0x normal playback to preserve timing, audio sync, and speech pitch (vocal tones)
      video.playbackRate = 1.0;

      // Seek to beginning and wait for seek operation to complete before initiating playback/recording
      video.currentTime = 0;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        setTimeout(resolve, 300); // safety fallback
      });

      // Start playback as muted first to guarantee modern browsers allow programmatic playback,
      // then immediately unmute it so that the Web Audio API can capture the audio stream.
      video.muted = true;
      try {
        await video.play();
        video.muted = false;
      } catch (playErr: any) {
        console.warn("[Export] Muted video play failed, retrying with unmuted mode directly...", playErr.message);
        video.muted = false;
        if (audioCtx) {
          await audioCtx.resume().catch(() => {});
        }
        await video.play();
      }

      if (audioCtx && audioCtx.state === "suspended") {
        await audioCtx.resume().catch(() => {});
      }
      recorder.start();

    } catch (err: any) {
      console.error("Export failed:", err);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setExportError(err.message || "An unexpected error occurred during export.");
      setIsExporting(false);
      cleanupDom(); // Clean up temporary DOM nodes on error
    }
  };

  const handleCancel = () => {
    if (exportVideoRef.current) {
      exportVideoRef.current.pause();
    }
    if (exportVoiceAudioRef.current) {
      exportVoiceAudioRef.current.pause();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsExporting(false);
    setProgress(0);

    // Clean up temporary DOM nodes on cancellation
    const el = document.getElementById("export-temp-container");
    if (el) {
      el.remove();
    }
  };

  return (
    <div className="w-full space-y-4">
      {!isExporting && !exportComplete && (
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-4 shadow-inner">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-pink-400" /> Choose Export Resolution (गुणवत्ता चयन)
            </span>
            
            {/* Resolution Selector Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              {([
                { id: "original", label: "Original (ओरिजिनल)", desc: "Perfect & Smooth" },
                { id: "1080p", label: "1080p HD", desc: "Crisp upscale" },
                { id: "2k", label: "2K QHD", desc: "Ultra sharp" },
                { id: "4k", label: "4K UHD", desc: "Max Cinema" }
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setResolution(opt.id)}
                  className={`p-2.5 rounded-xl border-2 transition text-left flex flex-col justify-between ${
                    resolution === opt.id
                      ? "bg-pink-600/10 border-pink-500 text-white"
                      : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="text-xs font-black block">{opt.label}</span>
                  <span className="text-[9px] text-slate-400 mt-0.5 block">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {aiVoiceUrl && (
            <div className="flex items-center justify-between p-3.5 bg-indigo-950/20 border border-indigo-500/10 rounded-2xl">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black text-slate-200">Mix AI Voiceover into Video Export</span>
                <span className="text-[10px] text-slate-400 font-medium">Bake the generated voice track onto the video (ऐआई वॉइसओवर मिक्स करें)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={includeVoiceover} 
                  onChange={(e) => setIncludeVoiceover(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
              </label>
            </div>
          )}

          {/* Custom Filename Input Box */}
          <div className="flex flex-col gap-2 bg-slate-900/50 p-3.5 rounded-2xl border border-slate-850/60">
            <label className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-pink-400" /> वीडियो का नाम दर्ज करें (Video Filename)
            </label>
            <input
              type="text"
              placeholder="odia_viral_video"
              value={videoName}
              onChange={(e) => setVideoName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500/50 transition font-bold"
              id="input-video-filename"
            />
            <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
              <span className="text-pink-400 font-extrabold">महत्वपूर्ण:</span> वीडियो सीधे इसी नाम के साथ <strong className="text-emerald-400">.mp4</strong> फॉर्मेट में डाउनलोड होगा। (Extension will be auto-saved).
            </p>
          </div>

          {/* Core Export button */}
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white font-black py-4 px-6 rounded-2xl shadow-xl transition-all duration-300 transform active:scale-95 cursor-pointer mt-2"
            id="btn-export-video"
          >
            <Sparkles className="w-5 h-5 animate-pulse text-yellow-300 fill-yellow-300" />
            <span>Generate &amp; Download in {resolution.toUpperCase()}</span>
          </button>
        </div>
      )}

      {isExporting && (
        <div className="p-5 bg-slate-900 border border-slate-850 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Loader2 className="w-4.5 h-4.5 animate-spin text-pink-500" />
              {isConvertingToMp4 ? (
                <span>Converting to highly compatible MP4... (सोशल मीडिया के लिए वीडियो तैयार हो रहा है)</span>
              ) : (
                <span>Compiling {resolution.toUpperCase()} Video (ओरिजिनल क्वालिटी)...</span>
              )}
            </span>
            <span className="text-sm font-mono font-black text-pink-400">
              {isConvertingToMp4 ? "Transcoding..." : `${progress}%`}
            </span>
          </div>

          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-pink-500 to-purple-600 h-full rounded-full transition-all duration-200"
              style={{ width: isConvertingToMp4 ? "100%" : `${progress}%` }}
            />
          </div>

          {/* Live Preview Container (forces browser graphics priority & avoids background throttling) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Live Rendering Feed (लाइव रेंडरिंग फ़ीड)</span>
            <div 
              id="export-preview-box" 
              className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-850 shadow-inner flex items-center justify-center"
            />
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>
              {isConvertingToMp4 
                ? "Baking high-quality H.264/AAC MP4..." 
                : "Keep tab open. Canvas rendering..."}
            </span>
            {!isConvertingToMp4 && (
              <button
                onClick={handleCancel}
                className="text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                id="btn-cancel-export"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {exportComplete && (
        <div className="p-5 bg-emerald-950/40 border border-emerald-500/25 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-xl text-emerald-400">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Export Success! (वीडियो तैयार हो गया है)</h4>
              <p className="text-xs text-emerald-300 mt-1">
                Your video with captions has been converted into a high-compatibility format (**{resolution.toUpperCase()}**).
              </p>
            </div>
          </div>

          {/* Real user-action direct download link to bypass browser iframe restrictions */}
          {exportedVideoUrl && (
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4">
              <div className="space-y-3">
                <p className="text-[11px] text-slate-300 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  वीडियो डाउनलोड करें (Download Captioned Video):
                </p>
                
                {/* 1. Primary Direct Download Button (Force absolute URL & Target _blank for maximum Webview/Android support) */}
                <a
                  href={exportedVideoUrl.startsWith("http") ? exportedVideoUrl : window.location.origin + exportedVideoUrl}
                  download={exportedVideoFilename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black py-3 px-5 rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer text-sm"
                  id="btn-manual-download"
                >
                  <Download className="w-5 h-5 animate-bounce text-white" />
                  <span>Save Video to Storage (गैलरी में सेव करें)</span>
                </a>

                {/* 2. Webview / Android Backup Button: Copy direct video download link */}
                <button
                  type="button"
                  onClick={copyVideoUrlToClipboard}
                  className={`w-full flex items-center justify-center gap-1.5 border text-xs font-bold py-2.5 px-4 rounded-xl transition-all transform active:scale-95 cursor-pointer ${
                    copiedVideoUrl 
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" 
                      : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                  }`}
                >
                  <Copy className="w-4 h-4" />
                  <span>{copiedVideoUrl ? "✓ Video Link Copied! (लिंक कॉपी हो गया)" : "Copy Direct Video Link (लिंक कॉपी करें)"}</span>
                </button>

                {copiedVideoUrl && (
                  <p className="text-[10px] text-emerald-400 font-medium text-center">
                    💡 Link copy ho gaya hai! Isse Chrome browser me open karke direct download kar sakte hain!
                  </p>
                )}

                {/* 3. HTML5 Video Player: The absolute ultimate fallback for Mobile Webviews */}
                <div className="border-t border-slate-800/80 pt-3 space-y-2">
                  <p className="text-[11px] text-slate-300 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                    वीडियो प्ले करें / लॉन्ग-प्रेस करके सेव करें (Direct Video Backup):
                  </p>
                  <video
                    src={exportedVideoUrl.startsWith("http") ? exportedVideoUrl : window.location.origin + exportedVideoUrl}
                    controls
                    playsInline
                    className="w-full rounded-xl border border-slate-800 shadow-md bg-black max-h-[300px]"
                  />
                  <p className="text-[9px] text-slate-400 font-medium leading-normal italic text-center">
                    ℹ️ Mobile Chrome standard features: click 3 dots on video to Download, or long press video to save.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-3 space-y-3">
                <p className="text-[11px] text-slate-300 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse"></span>
                  सबटाइटल फ़ाइलें डाउनलोड / कॉपी करें (Download & Copy Subtitles):
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={downloadSRT}
                    className="flex items-center justify-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/25 text-indigo-200 text-xs font-black py-2.5 px-3 rounded-xl transition-all transform active:scale-95 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Download .SRT</span>
                  </button>
                  <button
                    onClick={downloadTXT}
                    className="flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-black py-2.5 px-3 rounded-xl transition-all transform active:scale-95 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Download .TXT</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={copySRTToClipboard}
                    className={`flex items-center justify-center gap-1.5 border text-[11px] font-bold py-2.5 px-3 rounded-xl transition-all transform active:scale-95 cursor-pointer ${
                      copiedSRT 
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" 
                        : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedSRT ? "SRT Copied! (कॉपी हो गया)" : "Copy SRT (कॉपी करें)"}</span>
                  </button>
                  <button
                    onClick={copyTXTToClipboard}
                    className={`flex items-center justify-center gap-1.5 border text-[11px] font-bold py-2.5 px-3 rounded-xl transition-all transform active:scale-95 cursor-pointer ${
                      copiedTXT 
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" 
                        : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedTXT ? "TXT Copied! (कॉपी हो गया)" : "Copy TXT (कॉपी करें)"}</span>
                  </button>
                </div>

                {copiedSRT && (
                  <p className="text-[10px] text-emerald-400 font-bold text-center animate-pulse">
                    ✓ SRT timeline is copied! (क्लिपबोर्ड में कॉपी हो गया है!)
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => {
                // Clear state
                if (exportedVideoUrl) {
                  try {
                    URL.revokeObjectURL(exportedVideoUrl);
                  } catch (e) {}
                }
                setExportedVideoUrl(null);
                setExportedVideoFilename("");
                setExportComplete(false);
              }}
              className="flex-1 text-center bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 text-xs font-bold py-2 px-4 rounded-xl transition cursor-pointer"
              id="btn-reset-export"
            >
              Export Another Version
            </button>
          </div>
        </div>
      )}

      {exportError && (
        <div className="p-4 bg-red-950/40 border border-red-500/25 rounded-2xl shadow-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-white">Export Failed</h5>
            <p className="text-[11px] text-red-300 leading-relaxed">{exportError}</p>
            <button
              onClick={() => setExportError(null)}
              className="text-[11px] text-red-400 hover:text-red-300 font-semibold underline mt-1"
              id="btn-dismiss-error"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
