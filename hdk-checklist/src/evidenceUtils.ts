export interface EvidenceItem {
  id: string;
  type: "photo" | "video";
  dataUrl: string;   // compressed JPEG for photo; thumbnail JPEG for video
  name: string;
  capturedAt: string;
}

const MAX_PX = 1024;
const PHOTO_QUALITY = 0.75;
const VIDEO_THUMB_PX = 800;

export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > MAX_PX || h > MAX_PX) {
        if (w >= h) { h = Math.round((h * MAX_PX) / w); w = MAX_PX; }
        else        { w = Math.round((w * MAX_PX) / h); h = MAX_PX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export async function generateVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => { video.currentTime = 0.5; };
    video.onseeked = () => {
      cleanup();
      let w = video.videoWidth || 640;
      let h = video.videoHeight || 360;
      if (w > VIDEO_THUMB_PX) { h = Math.round((h * VIDEO_THUMB_PX) / w); w = VIDEO_THUMB_PX; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, w, h);
      // "VIDEO" badge overlay
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, w, 32);
      ctx.fillStyle = "white";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("▶  VIDEO", 10, 21);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };

    video.onerror = () => { cleanup(); reject(new Error("Video thumbnail failed")); };
    // Fallback for browsers that don't fire onseeked after preload
    setTimeout(() => {
      if (video.readyState >= 2) video.currentTime = 0.5;
    }, 800);
    video.src = url;
  });
}

export async function processFile(file: File): Promise<EvidenceItem> {
  const isVideo = file.type.startsWith("video/");
  let dataUrl: string;
  try {
    dataUrl = isVideo ? await generateVideoThumbnail(file) : await compressImage(file);
  } catch {
    // Fallback: placeholder thumbnail
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 90;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1F334D";
    ctx.fillRect(0, 0, 160, 90);
    ctx.fillStyle = "white";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(isVideo ? "▶ VIDEO" : "📷 PHOTO", 80, 50);
    dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  }
  return {
    id: crypto.randomUUID(),
    type: isVideo ? "video" : "photo",
    dataUrl,
    name: file.name,
    capturedAt: new Date().toISOString(),
  };
}
