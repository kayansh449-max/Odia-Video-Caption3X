/**
 * Client-side audio extraction utility for video files.
 * Uses Web Audio API to decode video soundtracks and package them as optimized 16kHz Mono WAV files.
 */

export async function extractAudioFromVideo(
  videoFile: File,
  onProgress: (percent: number) => void
): Promise<{ wavBlob: Blob; duration: number; base64: string }> {
  onProgress(5);
  
  // 1. Convert video file to ArrayBuffer
  onProgress(15);
  const arrayBuffer = await videoFile.arrayBuffer();
  onProgress(35);

  // 2. Decode audio data
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  
  onProgress(50);
  let audioBuffer: AudioBuffer | null = null;
  let duration = 10;
  
  try {
    // Slice to ensure we don't pass a transferred buffer
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (error) {
    console.error("Audio decoding failed, attempting secondary offline decode:", error);
    try {
      const offlineCtx = new OfflineAudioContext(1, 44100, 44100);
      audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
    } catch (err2) {
      console.warn("Could not decode audio track (the video might be silent or have no audio track). Generating a silent fallback track...", err2);
    }
  } finally {
    try {
      await audioCtx.close();
    } catch (e) {
      console.warn("Error closing audioCtx:", e);
    }
  }
  
  if (!audioBuffer) {
    // Get duration from video metadata
    try {
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      const blobUrl = URL.createObjectURL(videoFile);
      tempVideo.src = blobUrl;
      await new Promise<void>((resolve) => {
        tempVideo.onloadedmetadata = () => {
          duration = tempVideo.duration || 10;
          resolve();
        };
        tempVideo.onerror = () => {
          duration = 10;
          resolve();
        };
        // Safety timeout
        setTimeout(resolve, 1500);
      });
      URL.revokeObjectURL(blobUrl);
    } catch (metadataErr) {
      console.warn("Could not retrieve video metadata duration:", metadataErr);
    }

    // Create a silent buffer of 'duration' seconds at 16000 Hz
    const sampleRateFallback = 16000;
    const fallbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioBuffer = fallbackCtx.createBuffer(1, Math.max(16000, Math.round(sampleRateFallback * duration)), sampleRateFallback);
    try { fallbackCtx.close(); } catch(e){}
  } else {
    duration = audioBuffer.duration || 10;
  }
  
  onProgress(75);
  
  // 3. Downsample to 16kHz mono (optimizes speech transcription)
  const targetSampleRate = 16000;
  const numChannels = 1; // mono
  const lengthInSamples = Math.max(16000, Math.round(targetSampleRate * duration));
  
  const offlineCtx = new OfflineAudioContext(
    numChannels,
    lengthInSamples,
    targetSampleRate
  );

  // Create buffer source
  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start();

  // Render
  onProgress(85);
  const renderedBuffer = await offlineCtx.startRendering();
  onProgress(92);

  // 4. Encode to 16-bit PCM WAV
  const wavBlob = audioBufferToWav(renderedBuffer);
  onProgress(98);

  // 5. Convert to base64 for API delivery
  const base64 = await blobToBase64(wavBlob);
  onProgress(100);

  // Clean up
  try {
    if (audioCtx && audioCtx.state !== "closed") {
      await audioCtx.close();
    }
  } catch (e) {
    console.warn("Error closing audioCtx at cleanup:", e);
  }

  return {
    wavBlob,
    duration,
    base64,
  };
}

/**
 * Converts an AudioBuffer to a WAV format Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = Raw uncompressed PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  if (numChannels === 2) {
    result = interleaveChannels(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }

  const bufferLength = result.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength, true);

  // Write PCM audio samples
  floatTo16BitPCM(view, 44, result);

  return new Blob([view], { type: 'audio/wav' });
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function interleaveChannels(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
