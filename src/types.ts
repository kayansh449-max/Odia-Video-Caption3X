export interface Caption {
  text: string;
  start: number; // in seconds
  end: number; // in seconds
  id?: string;
}

export type TemplateId = 
  | 'simple-white'
  | 'viral-shorts'
  | 'mrbeast-style'
  | 'emotional-story'
  | 'reels-trending'
  | 'viral-highlights'
  | 'emoji-fusion'
  | 'karaoke-pro';

export type LanguageId = 'Odia' | 'Hindi' | 'English';

export interface CustomStyleSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  hasBackgroundBox: boolean;
  backgroundBoxColor: string;
  backgroundOpacity: number;
  lineSpacing: number;
  letterSpacing: number;
  textAlignment: 'left' | 'center' | 'right';
  bottomMargin: number; // offset from bottom in % or px
  safeAreaEnabled: boolean;
  
  // Animations
  animationStyle: string; // None, Word by Word, Popping Word by Word, etc.
  animationSpeed: number;
  animationDuration: number;
  animationIntensity: number;
}

export interface CaptionTemplate {
  id: TemplateId;
  name: string;
  description: string;
  containerClass: string; // Tailwinds classes for the container overlay
  textClass: string; // Tailwind classes for the text itself
  fontFamily: string; // font-family name
  lettercase: 'uppercase' | 'lowercase' | 'normal';
  animation: 'none' | 'bounce' | 'fade-in' | 'scale-up' | 'pop-in';
  badgeStyle?: boolean; // highlight whole phrase in a pill/badge
  highlightColor?: string; // highlight color for key words
}

export const TEMPLATES: CaptionTemplate[] = [
  {
    id: 'simple-white',
    name: 'Simple White',
    description: 'Classic subtitles, clean bottom-aligned look',
    containerClass: 'absolute bottom-8 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none',
    textClass: 'text-white font-sans text-lg md:text-2xl font-semibold tracking-wide drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] px-4 py-1.5 rounded bg-black/40 inline-block',
    fontFamily: 'Inter',
    lettercase: 'normal',
    animation: 'none',
  },
  {
    id: 'viral-shorts',
    name: 'Viral Shorts',
    description: 'Bold uppercase block subtitle with maximum contrast',
    containerClass: 'absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none scale-105',
    textClass: 'text-yellow-400 font-extrabold text-2xl md:text-4xl tracking-tighter uppercase inline-block px-5 py-2.5 bg-black rounded-lg border-4 border-yellow-400 shadow-2xl drop-shadow-[0_5px_5px_rgba(0,0,0,1)] font-mono',
    fontFamily: 'JetBrains Mono',
    lettercase: 'uppercase',
    animation: 'pop-in',
  },
  {
    id: 'mrbeast-style',
    name: 'MrBeast Style',
    description: 'Rotated colorful punchy words with bouncy motion',
    containerClass: 'absolute top-1/3 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none -rotate-3',
    textClass: 'text-white font-black text-3xl md:text-5xl tracking-tight uppercase inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]',
    fontFamily: 'Space Grotesk',
    lettercase: 'uppercase',
    animation: 'bounce',
  },
  {
    id: 'emotional-story',
    name: 'Emotional Story',
    description: 'Elegant typewriter style with gentle transition',
    containerClass: 'absolute bottom-16 left-1/2 -translate-x-1/2 w-10/12 text-center pointer-events-none',
    textClass: 'text-amber-100 font-serif italic text-lg md:text-2xl tracking-normal inline-block px-4 py-2 border-b border-amber-200/30 text-shadow-md',
    fontFamily: 'Playfair Display',
    lettercase: 'normal',
    animation: 'fade-in',
  },
  {
    id: 'reels-trending',
    name: 'Reels Trending',
    description: 'Minimal neon glow inside glass pill container',
    containerClass: 'absolute bottom-12 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none',
    textClass: 'text-cyan-300 font-sans text-xl md:text-3xl font-bold tracking-widest uppercase inline-block px-6 py-2 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.4)]',
    fontFamily: 'Outfit',
    lettercase: 'uppercase',
    animation: 'scale-up',
  },
  {
    id: 'viral-highlights',
    name: 'Viral Word Highlights',
    description: 'Key words highlighted with vivid neon colors for high retention',
    containerClass: 'absolute bottom-1/4 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none',
    textClass: 'text-white font-black text-2xl md:text-4xl tracking-tighter uppercase inline-block bg-slate-950/90 px-4.5 py-2.5 rounded-xl border-2 border-indigo-500 shadow-xl font-sans',
    fontFamily: 'Anek Odia',
    lettercase: 'uppercase',
    animation: 'bounce',
  },
  {
    id: 'emoji-fusion',
    name: 'Emoji Fusion ✨',
    description: 'Subtitles fused with high-expression matching emojis',
    containerClass: 'absolute bottom-1/4 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none',
    textClass: 'text-yellow-300 font-extrabold text-xl md:text-3xl tracking-wide inline-block px-5 py-2.5 bg-indigo-950/95 border-2 border-pink-500 rounded-2xl shadow-[0_0_20px_rgba(236,72,153,0.4)]',
    fontFamily: 'Noto Sans Odia',
    lettercase: 'normal',
    animation: 'scale-up',
  },
  {
    id: 'karaoke-pro',
    name: 'Karaoke Pro 🎤',
    description: 'Dynamic word-by-word karaoke flow matching voice cadence',
    containerClass: 'absolute bottom-1/4 left-1/2 -translate-x-1/2 w-11/12 text-center pointer-events-none',
    textClass: 'text-white font-black text-xl md:text-3xl tracking-wide inline-block px-6 py-3 bg-slate-950/90 border-2 border-emerald-400 rounded-3xl shadow-[0_0_25px_rgba(16,185,129,0.3)] font-sans',
    fontFamily: 'Outfit',
    lettercase: 'normal',
    animation: 'scale-up',
  },
];
