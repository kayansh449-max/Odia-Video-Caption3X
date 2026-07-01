const DB_NAME = "OdiaSubtitleFontsDB";
const STORE_NAME = "custom_fonts";
const DB_VERSION = 1;

export interface CustomFont {
  id: string;
  name: string;
  fileName: string;
  data: ArrayBuffer;
  format: "ttf" | "otf";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function saveFont(font: CustomFont): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(font);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      // Register font face in document fonts immediately
      registerFontInBrowser(font.name, font.data).catch(console.error);
      resolve();
    };
  });
}

export async function getAllFonts(): Promise<CustomFont[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  } catch (err) {
    console.error("Failed to load IndexedDB custom fonts:", err);
    return [];
  }
}

export async function deleteFont(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Dynamically register a font in document.fonts using FontFace API
 */
export async function registerFontInBrowser(name: string, data: ArrayBuffer): Promise<void> {
  try {
    const fontFace = new FontFace(name, data);
    const loadedFont = await fontFace.load();
    document.fonts.add(loadedFont);
    console.log(`Successfully loaded custom font: "${name}"`);
  } catch (err) {
    console.error(`Error loading custom font "${name}":`, err);
  }
}

/**
 * Load all stored fonts from IndexedDB and register them in the browser
 */
export async function loadAndRegisterAllCustomFonts(): Promise<CustomFont[]> {
  const fonts = await getAllFonts();
  for (const font of fonts) {
    await registerFontInBrowser(font.name, font.data);
  }
  return fonts;
}
