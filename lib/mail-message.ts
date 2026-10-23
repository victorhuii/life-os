/** Gmail's parsed MIME payload. Body text is never shortened into a snippet. */
export type MailPart = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; attachmentId?: string; size?: number }; parts?: MailPart[] };
export type MailMessage = { id: string; from: string; to: string; cc: string; subject: string; date: string; text: string; html: string; attachments: { name: string; mimeType: string; size: number; inline: boolean }[]; inlineImages: Record<string, string> };
export const mailHeader = (part: MailPart, name: string) => part.headers?.find(header => header.name.toLowerCase() === name.toLowerCase())?.value || "";
const bytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));
function decode(value: string, contentType: string) {
  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || "utf-8";
  try { return new TextDecoder(charset).decode(bytes(value)); }
  catch { return new TextDecoder().decode(bytes(value)); }
}
export function decodedHeader(value: string) {
  return value.replace(/\?=\s+(?==\?)/g, "?=").replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (original, charset, encoding, data) => {
    try {
      const raw = encoding.toLowerCase() === "b" ? bytes(data) : Uint8Array.from(data.replace(/_/g, " ").replace(/=([a-f\d]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))), (character: string) => character.charCodeAt(0));
      return new TextDecoder(charset).decode(raw);
    } catch { return original; }
  });
}
export async function parseMailMessage(id: string, payload: MailPart, readAttachment: (id: string) => Promise<{ data?: string; size?: number }>): Promise<MailMessage> {
  const text: string[] = [], html: string[] = [];
  const attachments: MailMessage["attachments"] = [], inlineImages: Record<string,string> = {};
  let total = 0, parts = 0, fetched = 0;
  async function walk(part: MailPart, depth = 0) {
    if (++parts > 1000 || depth > 30) throw new Error("This message’s structure is too large to display here. Open it in Gmail.");
    const type = (part.mimeType || "text/plain").toLowerCase();
    const cid = mailHeader(part,"content-id").replace(/^<|>$/g, "");
    const disposition = mailHeader(part,"content-disposition");
    const isAttachment = !!part.filename || /^attachment\b/i.test(disposition) || !/^(?:text\/(?:plain|html)|multipart\/)/.test(type);
    if (isAttachment) {
      attachments.push({name:decodedHeader(part.filename || "Attachment"),mimeType:type,size:part.body?.size || 0,inline:!!cid});
      if (cid && /^image\/(?:png|jpeg|gif|webp|avif)$/.test(type) && (part.body?.size || 0) <= 2_000_000 && fetched < 20 && total < 6_000_000) {
        const body = part.body?.data ? part.body : part.body?.attachmentId ? (++fetched,await readAttachment(part.body.attachmentId)) : null;
        if (body?.data && body.data.length <= 2_800_000) { total += body.data.length; inlineImages[cid] = `data:${type};base64,${body.data.replace(/-/g,"+").replace(/_/g,"/")}`; }
      }
      return;
    }
    if (part.parts?.length) { for (const child of part.parts) await walk(child,depth + 1); return; }
    if (type !== "text/plain" && type !== "text/html") return;
    if ((part.body?.size || 0) > 5_000_000) throw new Error("This message is too large to display here. Open the complete message in Gmail.");
    const body = part.body?.data !== undefined ? part.body : part.body?.attachmentId ? await readAttachment(part.body.attachmentId) : null;
    if (!body?.data) return;
    total += body.data.length;
    if (total > 10_000_000) throw new Error("This message is too large to display here. Open the complete message in Gmail.");
    const content = decode(body.data,mailHeader(part,"content-type"));
    (type === "text/html" ? html : text).push(content);
  }
  await walk(payload);
  return {id,from:decodedHeader(mailHeader(payload,"from")),to:decodedHeader(mailHeader(payload,"to")),cc:decodedHeader(mailHeader(payload,"cc")),subject:decodedHeader(mailHeader(payload,"subject")),date:mailHeader(payload,"date"),text:text.join("\n\n"),html:html.join("\n"),attachments,inlineImages};
}
