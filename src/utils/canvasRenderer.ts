import { TemplateId, CustomStyleSettings } from "../types";

interface DrawTextOptions {
  ctx: CanvasRenderingContext2D;
  text: string;
  width: number;
  height: number;
  templateId: TemplateId;
  currentTime: number;
  captionX?: number; // percentage 0-100
  captionY?: number; // percentage 0-100
  captionScale?: number; // multiplier e.g. 0.5 - 2.5
  captionBgOpacity?: number; // percentage 0-100
  start?: number;
  end?: number;
}

/**
 * Finds a matching emoji for localized or English keywords to inject virality
 */
export function getEmojiForText(text: string): string {
  const textLower = text.toLowerCase();
  
  if (textLower.includes("love") || textLower.includes("heart") || textLower.includes("ଭଲ") || textLower.includes("प्यार")) return "❤️";
  if (textLower.includes("fire") || textLower.includes("viral") || textLower.includes("ଭାଇରାଲ") || textLower.includes("ट्रेडिंग")) return "🔥";
  if (textLower.includes("money") || textLower.includes("cash") || textLower.includes("ଟଙ୍କା") || textLower.includes("पैसा")) return "💰";
  if (textLower.includes("laugh") || textLower.includes("happy") || textLower.includes("ଖୁସି") || textLower.includes("खुश")) return "😂";
  if (textLower.includes("sad") || textLower.includes("tear") || textLower.includes("ଦୁଃଖ")) return "😢";
  if (textLower.includes("music") || textLower.includes("song") || textLower.includes("ଗୀତ") || textLower.includes("गाना")) return "🎵";
  if (textLower.includes("time") || textLower.includes("clock") || textLower.includes("ସମୟ") || textLower.includes("समय")) return "⏰";
  if (textLower.includes("idea") || textLower.includes("think") || textLower.includes("ବୁଦ୍ଧି") || textLower.includes("ज्ञान")) return "💡";
  if (textLower.includes("namaskar") || textLower.includes("hello") || textLower.includes("ନମସ୍କାର") || textLower.includes("नमस्ते")) return "🙏";
  if (textLower.includes("super") || textLower.includes("magic") || textLower.includes("ସୁପର") || textLower.includes("चमत्कार")) return "✨";
  if (textLower.includes("auto") || textLower.includes("speed") || textLower.includes("ଅଟୋ")) return "⚡";
  if (textLower.includes("phone") || textLower.includes("video") || textLower.includes("ଭିଡିଓ") || textLower.includes("वीडियो")) return "📱";
  if (textLower.includes("star") || textLower.includes("ତାରା") || textLower.includes("सितारा")) return "⭐";
  if (textLower.includes("congratulations") || textLower.includes("wow") || textLower.includes("ବାଃ")) return "🎉";
  if (textLower.includes("cat") || textLower.includes("ବିଲେଇ")) return "🐱";
  if (textLower.includes("dog") || textLower.includes("କୁକୁର")) return "🐶";
  
  // Default cute emojis for viral vibes
  const fallbacks = ["✨", "🔥", "🚀", "💥", "🤩", "🙌", "🎯"];
  const charCodeSum = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return fallbacks[charCodeSum % fallbacks.length];
}

/**
 * Draws the caption text on the canvas based on the selected viral template
 */
export function drawCaptionOnCanvas({
  ctx,
  text,
  width,
  height,
  templateId,
  currentTime,
  captionX = 50,
  captionY,
  captionScale = 1.0,
  captionBgOpacity,
  start,
  end,
}: DrawTextOptions) {
  if (!text) return;

  ctx.save();

  // Helper to get rgba color using the custom background opacity setting
  const getBgColor = (r: number, g: number, b: number, defaultAlpha: number) => {
    const alpha = captionBgOpacity !== undefined ? captionBgOpacity / 100 : defaultAlpha;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Helper to get rgba border color that fades down to completely invisible when background opacity is lowered
  const getBorderColor = (r: number, g: number, b: number, defaultAlpha: number) => {
    const alpha = captionBgOpacity !== undefined ? (captionBgOpacity / 100) * defaultAlpha : defaultAlpha;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Define scale factor based on video resolution, amplified by custom user scale
  const baseScale = Math.min(width, height) / 400;
  const scale = baseScale * captionScale;

  // Compute final X and Y center points
  const posX = (captionX / 100) * width;
  
  // If Y isn't provided, use template-specific default height locations
  let posY = captionY !== undefined ? (captionY / 100) * height : 0;
  if (captionY === undefined) {
    if (templateId === 'mrbeast-style') {
      posY = height * 0.35;
    } else if (templateId === 'simple-white') {
      posY = height - 55 * baseScale;
    } else if (templateId === 'emotional-story') {
      posY = height - 70 * baseScale;
    } else if (templateId === 'reels-trending') {
      posY = height - 90 * baseScale;
    } else {
      posY = height / 2; // Center default
    }
  }

  // Animation scaling factor (bouncy entry)
  let animScale = 1.0;
  if (templateId === 'mrbeast-style' || templateId === 'viral-highlights' || templateId === 'viral-shorts') {
    animScale = 1 + 0.08 * Math.sin(currentTime * 12);
  }

  switch (templateId) {
    case 'simple-white': {
      // Classic subtitle with translucent backing
      const fontSize = Math.round(18 * scale);
      ctx.font = `600 ${fontSize}px "Inter", "Anek Odia", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const paddingX = 16 * scale;
      const paddingY = 8 * scale;

      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;

      const rectWidth = textWidth + paddingX * 2;
      const rectHeight = textHeight + paddingY * 2;
      const rectX = posX - rectWidth / 2;
      const rectY = posY - rectHeight / 2;

      // Draw background box
      ctx.fillStyle = getBgColor(0, 0, 0, 0.55);
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 6 * scale);
      ctx.fill();

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, posX, posY);
      break;
    }

    case 'viral-shorts': {
      // Bold yellow/white uppercase text with heavy black stroke
      const fontSize = Math.round(28 * scale);
      ctx.font = `900 ${fontSize}px "JetBrains Mono", "Impact", "Anek Odia", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const cleanText = text.toUpperCase();

      ctx.translate(posX, posY);
      ctx.scale(animScale, animScale);

      // Text background highlight box
      const metrics = ctx.measureText(cleanText);
      const boxW = metrics.width + 24 * scale;
      const boxH = fontSize + 16 * scale;

      ctx.fillStyle = getBgColor(0, 0, 0, 1.0);
      ctx.beginPath();
      ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 10 * scale);
      ctx.fill();

      // Border for box
      ctx.strokeStyle = getBorderColor(250, 204, 21, 1.0); // yellow-400
      ctx.lineWidth = 3.5 * scale;
      ctx.stroke();

      // Draw outline text
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6 * scale;
      ctx.lineJoin = 'round';
      ctx.strokeText(cleanText, 0, 0);

      // Draw solid text
      ctx.fillStyle = '#facc15'; // yellow-400
      ctx.fillText(cleanText, 0, 0);
      break;
    }

    case 'mrbeast-style': {
      // Rotated colorful text with heavy shadow and bounce
      const fontSize = Math.round(34 * scale);
      ctx.font = `900 ${fontSize}px "Space Grotesk", "Anek Odia", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const cleanText = text.toUpperCase();

      ctx.translate(posX, posY);
      ctx.rotate(-3 * Math.PI / 180); // Rotate -3 degrees
      ctx.scale(animScale, animScale);

      // Measure text
      const metrics = ctx.measureText(cleanText);
      const padding = 18 * scale;
      
      // Draw background outline card shadow
      ctx.fillStyle = getBgColor(0, 0, 0, 1.0);
      ctx.beginPath();
      ctx.roundRect(-metrics.width / 2 - padding, -fontSize / 2 - padding / 2 + 4 * scale, metrics.width + padding * 2, fontSize + padding, 12 * scale);
      ctx.fill();

      // Draw primary yellow/orange card
      ctx.fillStyle = getBgColor(245, 158, 11, 1.0);
      ctx.beginPath();
      ctx.roundRect(-metrics.width / 2 - padding, -fontSize / 2 - padding / 2, metrics.width + padding * 2, fontSize + padding, 12 * scale);
      ctx.fill();
      
      ctx.strokeStyle = getBorderColor(0, 0, 0, 1.0);
      ctx.lineWidth = 4 * scale;
      ctx.stroke();

      // Text Stroke
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8 * scale;
      ctx.lineJoin = 'round';
      ctx.strokeText(cleanText, 0, 1 * scale);

      // Text Fill
      ctx.fillStyle = '#ffffff';
      ctx.fillText(cleanText, 0, 1 * scale);
      break;
    }

    case 'emotional-story': {
      // Serif italic delicate font
      const fontSize = Math.round(20 * scale);
      ctx.font = `italic 500 ${fontSize}px "Playfair Display", "Noto Sans Odia", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Soft white/cream glowing drop shadow
      ctx.shadowColor = 'rgba(253, 246, 227, 0.4)';
      ctx.shadowBlur = 8 * scale;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Simple dark drop shadow for reading
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillText(text, posX + 1.5 * scale, posY + 1.5 * scale);

      ctx.fillStyle = '#fef3c7'; // amber-100
      ctx.fillText(text, posX, posY);
      break;
    }

    case 'reels-trending': {
      // Cyan pill badge at bottom
      const fontSize = Math.round(22 * scale);
      ctx.font = `800 ${fontSize}px "Outfit", "Anek Odia", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const cleanText = text.toUpperCase();
      const py = 10 * scale;
      const px = 22 * scale;

      const metrics = ctx.measureText(cleanText);
      const pillW = metrics.width + px * 2;
      const pillH = fontSize + py * 2;
      const pillX = posX - pillW / 2;
      const pillY = posY - pillH / 2;

      // Draw neon glow pill background
      ctx.shadowColor = 'rgba(34, 211, 238, 0.6)'; // cyan neon
      ctx.shadowBlur = 12 * scale;
      
      ctx.fillStyle = getBgColor(2, 6, 23, 0.85); // slate-950/85
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2); // Capsule
      ctx.fill();

      // Draw neon cyan border
      ctx.shadowBlur = 0; // Reset shadow for outline
      ctx.strokeStyle = getBorderColor(34, 211, 238, 0.7);
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      // Render cyan text
      ctx.fillStyle = '#67e8f9'; // cyan-300
      ctx.fillText(cleanText, posX, posY);
      break;
    }

    case 'viral-highlights': {
      // Important word highlighted in bright neon green/pink, others white!
      const fontSize = Math.round(32 * scale);
      ctx.font = `900 ${fontSize}px "Outfit", "Anek Odia", "Arial Black", sans-serif`;
      ctx.textAlign = 'left'; // Left text baseline alignment for word-by-word drawing
      ctx.textBaseline = 'middle';

      ctx.translate(posX, posY);
      ctx.scale(animScale, animScale);

      const words = text.split(/\s+/);
      const wordMetrics = words.map(w => ctx.measureText(w).width);
      const spaceWidth = ctx.measureText(" ").width;
      const totalW = wordMetrics.reduce((a, b) => a + b, 0) + spaceWidth * (words.length - 1);
      
      // Since textAlign is 'left', offset our starting position to make it center-aligned overall
      let currentX = -totalW / 2;

      // Find the longest word to highlight as "important"
      const longestWord = [...words].sort((a, b) => b.length - a.length)[0];

      words.forEach((word, idx) => {
        const isHighlighted = word === longestWord && words.length > 1;

        // Draw shadow/stroke first
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6 * scale;
        ctx.lineJoin = 'round';
        ctx.strokeText(word, currentX, 0);

        // Word Fill
        if (isHighlighted) {
          ctx.fillStyle = '#22c55e'; // neon green-500
        } else if (idx % 2 === 0) {
          ctx.fillStyle = '#ffffff'; // standard white
        } else {
          ctx.fillStyle = '#facc15'; // yellow-400 alternate accent
        }

        ctx.fillText(word, currentX, 0);
        currentX += wordMetrics[idx] + spaceWidth;
      });
      break;
    }

    case 'emoji-fusion': {
      // Beautiful text badge with corresponding emoji appended gracefully
      const fontSize = Math.round(22 * scale);
      ctx.font = `800 ${fontSize}px "Outfit", "Noto Sans Odia", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Find matching emoji
      const emoji = getEmojiForText(text);
      const displayText = `${text} ${emoji}`;

      const py = 12 * scale;
      const px = 24 * scale;

      const metrics = ctx.measureText(displayText);
      const pillW = metrics.width + px * 2;
      const pillH = fontSize + py * 2;
      const pillX = posX - pillW / 2;
      const pillY = posY - pillH / 2;

      // Dual shadow/glow
      ctx.shadowColor = 'rgba(236, 72, 153, 0.5)'; // Hot pink glow
      ctx.shadowBlur = 16 * scale;

      // Dark background card
      ctx.fillStyle = getBgColor(15, 12, 30, 0.9); // rich purple-dark
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 16 * scale);
      ctx.fill();

      // Pinkish/Violet gradient border
      ctx.shadowBlur = 0;
      ctx.strokeStyle = getBorderColor(236, 72, 153, 1.0); // hot pink border
      ctx.lineWidth = 2.5 * scale;
      ctx.stroke();

      // Glowing text
      ctx.fillStyle = '#fef08a'; // yellow-200
      ctx.fillText(displayText, posX, posY);
      break;
    }

    case 'karaoke-pro': {
      // Professional Karaoke style: highlights words one-by-one as the speaker talks
      const fontSize = Math.round(23 * scale);
      ctx.font = `900 ${fontSize}px "Outfit", "Noto Sans Odia", sans-serif`;
      ctx.textBaseline = 'middle';

      const words = text.split(/\s+/);
      const totalDuration = (end || 0) - (start || 0) || 2.5;
      const elapsed = currentTime - (start || 0);
      const wordDuration = totalDuration / Math.max(1, words.length);
      const activeWordIndex = Math.min(
        words.length - 1,
        Math.max(0, Math.floor(elapsed / wordDuration))
      );

      // Split words into 2 lines if we have 10-12 words to keep it readable and fit the screen
      const splitLimit = 6;
      const useTwoLines = words.length > splitLimit;
      const line1Words = useTwoLines ? words.slice(0, Math.ceil(words.length / 2)) : words;
      const line2Words = useTwoLines ? words.slice(Math.ceil(words.length / 2)) : [];

      // Calculate sizes to draw the background capsule
      const spaceW = ctx.measureText(" ").width;

      const getLineWidthAndMetrics = (lineWords: string[]) => {
        const metrics = lineWords.map(w => ctx.measureText(w).width);
        const totalW = metrics.reduce((a, b) => a + b, 0) + spaceW * (lineWords.length - 1);
        return { totalW, metrics };
      };

      const line1Data = getLineWidthAndMetrics(line1Words);
      const line2Data = useTwoLines ? getLineWidthAndMetrics(line2Words) : { totalW: 0, metrics: [] };

      const maxLineW = Math.max(line1Data.totalW, line2Data.totalW);
      const py = 14 * scale;
      const px = 26 * scale;

      const cardW = maxLineW + px * 2;
      const cardH = useTwoLines ? (fontSize * 2 + 16 * scale) + py * 2 : fontSize + py * 2;
      
      const cardX = posX - cardW / 2;
      const cardY = posY - cardH / 2;

      // Draw background card with custom background opacity
      ctx.fillStyle = getBgColor(10, 10, 15, 0.88); // slate-950/88
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 20 * scale);
      ctx.fill();

      // Draw Emerald neon border
      ctx.strokeStyle = getBorderColor(16, 185, 129, 0.6);
      ctx.lineWidth = 2.5 * scale;
      ctx.stroke();

      // Render words function
      const drawWordLine = (lineWords: string[], wordMetrics: number[], startY: number, wordStartIndex: number) => {
        const lineTotalW = wordMetrics.reduce((a, b) => a + b, 0) + spaceW * (lineWords.length - 1);
        let curX = posX - lineTotalW / 2;

        lineWords.forEach((word, index) => {
          const originalIndex = wordStartIndex + index;
          const isActive = originalIndex === activeWordIndex;

          ctx.save();
          ctx.translate(curX + wordMetrics[index] / 2, startY);

          // Active word bounce/scaling animation
          if (isActive) {
            const bounce = 1.12 + 0.05 * Math.sin(currentTime * 15);
            ctx.scale(bounce, bounce);
          }

          ctx.textAlign = 'center';

          // Word stroke outline
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 5 * scale;
          ctx.lineJoin = 'round';
          ctx.strokeText(word, 0, 0);

          // Word fill
          if (isActive) {
            ctx.fillStyle = '#10b981'; // Vivid emerald green
            
            // Add a clean shadow/glow under the active word
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 8 * scale;
            ctx.fillText(word, 0, 0);
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'; // Dimmed white for non-spoken words
            ctx.fillText(word, 0, 0);
          }

          ctx.restore();
          curX += wordMetrics[index] + spaceW;
        });
      };

      // Draw lines
      if (useTwoLines) {
        const firstLineY = posY - fontSize * 0.7;
        const secondLineY = posY + fontSize * 0.7;
        drawWordLine(line1Words, line1Data.metrics, firstLineY, 0);
        drawWordLine(line2Words, line2Data.metrics, secondLineY, line1Words.length);
      } else {
        drawWordLine(line1Words, line1Data.metrics, posY, 0);
      }

      break;
    }
  }

  ctx.restore();
}

/**
 * Draws custom styled subtitles on canvas with requested animation and safe areas.
 */
export function drawCustomCaptionOnCanvas({
  ctx,
  text,
  width,
  height,
  currentTime,
  captionX = 50,
  captionY,
  captionScale = 1.0,
  start = 0,
  end = 3,
  settings,
}: {
  ctx: CanvasRenderingContext2D;
  text: string;
  width: number;
  height: number;
  currentTime: number;
  captionX?: number;
  captionY?: number;
  captionScale?: number;
  start?: number;
  end?: number;
  settings: CustomStyleSettings;
}) {
  if (!text) return;

  ctx.save();

  // 1. Determine Position
  const posX = (captionX / 100) * width;
  
  // Custom margin or default safe area placement
  let posY = captionY !== undefined ? (captionY / 100) * height : height - settings.bottomMargin;
  
  if (settings.safeAreaEnabled) {
    // Keep captions within TikTok/Instagram safe zones: top > 15%, bottom < 80%
    const minY = height * 0.15;
    const maxY = height * 0.80;
    posY = Math.max(minY, Math.min(maxY, posY));
  }

  const baseScale = Math.min(width, height) / 400;
  const scale = baseScale * captionScale;
  const fontSize = Math.round(settings.fontSize * scale);

  // Parse speed and duration multipliers
  const animSpeed = settings.animationSpeed || 1.0;
  const animIntensity = settings.animationIntensity || 5;

  const duration = end - start || 1;
  const elapsed = currentTime - start;

  // Let's split text into words and lines
  const words = text.split(/\s+/);
  const lineLimit = 6;
  const useTwoLines = words.length > lineLimit;
  const line1Words = useTwoLines ? words.slice(0, Math.ceil(words.length / 2)) : words;
  const line2Words = useTwoLines ? words.slice(Math.ceil(words.length / 2)) : [];

  const line1Text = line1Words.join(" ");
  const line2Text = line2Words.join(" ");

  // Set font properties
  ctx.font = `${settings.fontWeight} ${fontSize}px "${settings.fontFamily}", sans-serif`;
  ctx.textAlign = settings.textAlignment;
  ctx.textBaseline = 'middle';

  // 2. Compute Animation Factors
  let globalAlpha = 1.0;
  let globalScale = 1.0;
  let rotateRad = 0;
  let translateX = 0;
  let translateY = 0;

  const animType = settings.animationStyle.toLowerCase();

  if (animType === "fade in") {
    const fadeDuration = 0.3 * (settings.animationDuration || 1.0) / animSpeed;
    globalAlpha = Math.min(1.0, elapsed / fadeDuration);
  } else if (animType === "fade out") {
    const fadeOutDuration = 0.3 * (settings.animationDuration || 1.0) / animSpeed;
    const remaining = end - currentTime;
    globalAlpha = Math.max(0.0, Math.min(1.0, remaining / fadeOutDuration));
  } else if (animType === "zoom") {
    const progress = Math.min(1.0, elapsed / duration);
    globalScale = 1.0 + progress * 0.25 * (animIntensity / 5) * animSpeed;
  } else if (animType === "shake") {
    translateX = (Math.random() - 0.5) * animIntensity * scale;
    translateY = (Math.random() - 0.5) * animIntensity * scale;
  }

  // 3. Helper to draw text line with styling
  const drawStyledTextLine = (lineStr: string, x: number, y: number, wordHighlightIndex?: number, lineScale = 1.0, lineAlpha = 1.0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(lineScale, lineScale);
    ctx.globalAlpha = globalAlpha * lineAlpha;

    const lineWords = lineStr.split(/\s+/);
    const spaceW = ctx.measureText(" ").width;

    // Check if we need word-by-word calculations (some word animations)
    const isWordAnim = ["word by word", "popping word by word", "active word", "active word zoom", "popping words"].includes(animType);

    if (isWordAnim) {
      // Calculate start coordinates for correct alignment
      const wordMetrics = lineWords.map(w => ctx.measureText(w).width);
      const totalW = wordMetrics.reduce((a, b) => a + b, 0) + spaceW * (lineWords.length - 1);
      
      let startX = 0;
      if (settings.textAlignment === 'center') {
        startX = -totalW / 2;
      } else if (settings.textAlignment === 'right') {
        startX = -totalW;
      }

      let curX = startX;

      // Word duration calculations
      const totalDuration = duration;
      const wordDuration = totalDuration / Math.max(1, words.length);
      const currentGlobalWordIndex = Math.min(
        words.length - 1,
        Math.max(0, Math.floor(elapsed / wordDuration))
      );

      lineWords.forEach((word, idx) => {
        const globalIdx = wordHighlightIndex !== undefined ? wordHighlightIndex + idx : idx;
        const isActive = globalIdx === currentGlobalWordIndex;
        const hasBeenSpoken = globalIdx <= currentGlobalWordIndex;

        const wordW = wordMetrics[idx];
        const wordCenterX = curX + wordW / 2;

        ctx.save();
        ctx.translate(wordCenterX, 0);

        // Apply word-specific animations
        let wordScale = 1.0;
        let wordAlpha = 1.0;
        let wordColor = settings.fontColor;

        if (animType === "word by word") {
          if (!hasBeenSpoken) {
            wordAlpha = 0.0;
          }
        } else if (animType === "popping word by word") {
          if (isActive) {
            const wordElapsed = elapsed - (globalIdx * wordDuration);
            wordScale = 1.0 + Math.sin(Math.min(Math.PI, (wordElapsed / wordDuration) * Math.PI)) * 0.3 * (animIntensity / 5);
            wordColor = "#22c55e"; // bright active color
          } else {
            wordScale = 1.0;
          }
        } else if (animType === "active word") {
          if (isActive) {
            wordColor = "#facc15"; // bright yellow
          } else {
            wordColor = "rgba(255,255,255,0.4)"; // dimmed
          }
        } else if (animType === "active word zoom") {
          if (isActive) {
            const wordElapsed = elapsed - (globalIdx * wordDuration);
            wordScale = 1.1 + Math.sin(Math.min(Math.PI, (wordElapsed / wordDuration) * Math.PI)) * 0.2;
            wordColor = "#facc15";
          } else {
            wordScale = 0.9;
            wordColor = "rgba(255,255,255,0.4)";
          }
        } else if (animType === "popping words") {
          if (hasBeenSpoken) {
            const wordElapsed = elapsed - (globalIdx * wordDuration);
            wordScale = Math.min(1.0, wordElapsed / (0.15 / animSpeed)) * 1.1;
            if (isActive) {
              wordScale = 1.25;
            }
          } else {
            wordAlpha = 0.0;
          }
        }

        ctx.scale(wordScale, wordScale);
        ctx.globalAlpha = ctx.globalAlpha * wordAlpha;

        // Draw shadow first
        if (settings.shadowBlur > 0) {
          ctx.shadowColor = settings.shadowColor;
          ctx.shadowBlur = settings.shadowBlur * scale;
          ctx.shadowOffsetX = 2 * scale;
          ctx.shadowOffsetY = 2 * scale;
        }

        // Draw outline / stroke
        if (settings.outlineWidth > 0) {
          ctx.strokeStyle = settings.outlineColor;
          ctx.lineWidth = settings.outlineWidth * scale;
          ctx.lineJoin = 'round';
          ctx.strokeText(word, 0, 0);
        }

        // Draw fill text
        ctx.fillStyle = wordColor;
        ctx.fillText(word, 0, 0);

        ctx.restore();
        curX += wordW + spaceW;
      });

    } else {
      // Draw entire line normally or with letter-by-letter
      let renderStr = lineStr;

      if (animType === "letter by letter") {
        const totalChars = text.length;
        const visibleCount = Math.floor(totalChars * Math.min(1.0, (elapsed / (duration * 0.8)) * animSpeed));
        
        // Count how many characters are in this line
        const lineStartIndex = wordHighlightIndex === 0 ? 0 : (line1Text.length + 1);
        const charactersInLine = lineStr.length;
        const lineEndIndex = lineStartIndex + charactersInLine;

        if (visibleCount < lineStartIndex) {
          renderStr = "";
        } else if (visibleCount >= lineEndIndex) {
          renderStr = lineStr;
        } else {
          renderStr = lineStr.substring(0, visibleCount - lineStartIndex);
        }
      }

      if (renderStr) {
        // Draw shadow
        if (settings.shadowBlur > 0) {
          ctx.shadowColor = settings.shadowColor;
          ctx.shadowBlur = settings.shadowBlur * scale;
          ctx.shadowOffsetX = 2 * scale;
          ctx.shadowOffsetY = 2 * scale;
        }

        // Draw outline / stroke
        if (settings.outlineWidth > 0) {
          ctx.strokeStyle = settings.outlineColor;
          ctx.lineWidth = settings.outlineWidth * scale;
          ctx.lineJoin = 'round';
          ctx.strokeText(renderStr, 0, 0);
        }

        // Draw solid text
        ctx.fillStyle = settings.fontColor;
        ctx.fillText(renderStr, 0, 0);
      }
    }

    ctx.restore();
  };

  // 4. Draw Background Box if active
  if (settings.hasBackgroundBox) {
    ctx.save();
    ctx.globalAlpha = globalAlpha * (settings.backgroundOpacity / 100);
    ctx.fillStyle = settings.backgroundBoxColor;

    const measureWidthOfLine = (str: string) => {
      return ctx.measureText(str).width;
    };

    const w1 = measureWidthOfLine(line1Text);
    const w2 = useTwoLines ? measureWidthOfLine(line2Text) : 0;
    const boxW = Math.max(w1, w2) + 24 * scale;

    const boxH = useTwoLines 
      ? (fontSize * 2 + settings.lineSpacing * 14 * scale) + 16 * scale 
      : fontSize + 16 * scale;

    const boxX = posX - (settings.textAlignment === 'center' ? boxW / 2 : settings.textAlignment === 'right' ? boxW : 0);
    const boxY = posY - boxH / 2;

    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8 * scale);
    ctx.fill();
    ctx.restore();
  }

  // 5. Draw Actual Subtitle Lines with Animations
  ctx.translate(posX, posY);
  ctx.scale(globalScale, globalScale);
  ctx.rotate(rotateRad);
  ctx.translate(translateX, translateY);

  if (useTwoLines) {
    const lineGap = settings.lineSpacing * 15 * scale + fontSize;
    const y1 = -lineGap / 2;
    const y2 = lineGap / 2;

    let line1Scale = 1.0;
    let line1Alpha = 1.0;
    let line2Scale = 1.0;
    let line2Alpha = 1.0;

    if (animType === "popping lines" || animType === "line by line") {
      const lineDuration = duration / 2;
      if (elapsed < lineDuration) {
        // Line 1 is popping or revealing, Line 2 is hidden
        line2Alpha = 0.0;
        if (animType === "popping lines") {
          const t = elapsed / lineDuration;
          line1Scale = 1.0 + Math.sin(Math.min(Math.PI, t * Math.PI)) * 0.15 * (animIntensity / 5);
        }
      } else {
        // Line 2 popped or revealed
        if (animType === "popping lines") {
          const t = (elapsed - lineDuration) / lineDuration;
          line2Scale = 1.0 + Math.sin(Math.min(Math.PI, t * Math.PI)) * 0.15 * (animIntensity / 5);
        }
      }
    } else if (animType === "expanding lines") {
      line1Scale = Math.min(1.0, elapsed / (0.25 / animSpeed));
      line2Scale = Math.min(1.0, Math.max(0.0, elapsed - 0.25) / (0.25 / animSpeed));
    } else if (animType === "falling lines") {
      const t1 = Math.min(1.0, elapsed / (0.4 / animSpeed));
      const t2 = Math.min(1.0, Math.max(0.0, elapsed - 0.25) / (0.4 / animSpeed));
      
      // Falling translateY effect
      const gravityOffset1 = (1.0 - Math.sin(t1 * Math.PI / 2)) * -30 * scale * (animIntensity / 5);
      const gravityOffset2 = (1.0 - Math.sin(t2 * Math.PI / 2)) * -30 * scale * (animIntensity / 5);

      drawStyledTextLine(line1Text, 0, y1 + gravityOffset1, 0, line1Scale, line1Alpha);
      drawStyledTextLine(line2Text, 0, y2 + gravityOffset2, line1Words.length, line2Scale, line2Alpha);
      ctx.restore();
      return;
    }

    drawStyledTextLine(line1Text, 0, y1, 0, line1Scale, line1Alpha);
    drawStyledTextLine(line2Text, 0, y2, line1Words.length, line2Scale, line2Alpha);
  } else {
    let lineScale = 1.0;
    let lineAlpha = 1.0;

    if (animType === "popping lines" || animType === "popping words") {
      const t = Math.min(1.0, elapsed / (0.35 / animSpeed));
      lineScale = 1.0 + Math.sin(t * Math.PI) * 0.18 * (animIntensity / 5);
    } else if (animType === "expanding lines") {
      lineScale = Math.min(1.0, elapsed / (0.3 / animSpeed));
    } else if (animType === "falling lines") {
      const t = Math.min(1.0, elapsed / (0.4 / animSpeed));
      const gravityOffset = (1.0 - Math.sin(t * Math.PI / 2)) * -30 * scale * (animIntensity / 5);
      drawStyledTextLine(line1Text, 0, gravityOffset, 0, lineScale, lineAlpha);
      ctx.restore();
      return;
    }

    drawStyledTextLine(line1Text, 0, 0, 0, lineScale, lineAlpha);
  }

  ctx.restore();
}
