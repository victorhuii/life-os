/** Build an isolated email document. Call only in the browser, never in dashboard HTML. */
export function mailDocument(html: string, inlineImages: Record<string,string>, remoteImages: boolean) {
  const document = new DOMParser().parseFromString(html,"text/html");
  document.querySelectorAll("script,template,noscript,iframe,frame,frameset,object,embed,applet,base,meta,link,svg,math,input,textarea,select,button,audio,video,source").forEach(node=>node.remove());
  document.querySelectorAll("form").forEach(form=>form.replaceWith(...form.childNodes));
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || ["srcdoc","srcset","action","formaction","ping","autofocus","contenteditable","background"].includes(attribute.name.toLowerCase())) element.removeAttribute(attribute.name);
    }
    if (element instanceof HTMLImageElement) {
      const source = element.getAttribute("src") || "";
      const cid = source.replace(/^cid:/i,"");
      let safe = /^cid:/i.test(source) ? inlineImages[cid] || "" : /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(source) ? source : "";
      if (!safe && remoteImages) { try { const url=new URL(source); if(url.protocol==="https:" && !url.username && !url.password)safe=url.href; } catch {} }
      if (safe) element.setAttribute("src",safe); else element.removeAttribute("src");
      element.setAttribute("referrerpolicy","no-referrer");
    } else element.removeAttribute("src");
    if (element.tagName === "A") {
      const href=element.getAttribute("href") || "";
      try { const url=new URL(href); if(!["https:","http:","mailto:"].includes(url.protocol) || url.username || url.password)element.removeAttribute("href"); }
      catch { element.removeAttribute("href"); }
      element.setAttribute("target","_blank"); element.setAttribute("rel","noopener noreferrer");
    } else {element.removeAttribute("href");element.removeAttribute("xlink:href");}
  }
  const csp = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:${remoteImages ? " https:" : ""}; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light}html,body{overflow:auto!important;min-height:0!important;height:auto!important}body{margin:0;padding:18px;background:#fff;color:#242424;font:14px/1.65 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#805735}</style>${document.head.innerHTML}</head><body>${document.body.innerHTML}</body></html>`;
}
