export function videoEmbed(url: string): { kind: "iframe" | "file"; src: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}?rel=0` };
    }
    if (host === "youtu.be") return { kind: "iframe", src: `https://www.youtube.com/embed${u.pathname}?rel=0` };
    if (host === "vimeo.com") return { kind: "iframe", src: `https://player.vimeo.com/video${u.pathname}` };
    if (host === "drive.google.com") {
      const m = u.pathname.match(/\/d\/([^/]+)/);
      if (m) return { kind: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview` };
    }
    if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname)) return { kind: "file", src: url };
    return { kind: "iframe", src: url };
  } catch {
    return { kind: "file", src: url };
  }
}
