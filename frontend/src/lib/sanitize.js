/**
 * HTML sanitizer for tenant-authored content rendered via dangerouslySetInnerHTML.
 *
 * Uses a small allow-list of tags and attributes that cover the needs of the
 * rich-text editor (react-quill) without permitting script, iframe, or event-
 * handler attributes that would enable cross-tenant XSS.
 *
 * Intentionally dependency-free (no DOMPurify) to avoid adding a runtime dep
 * in this PR. If tenant HTML use-cases expand, switch this file to DOMPurify.
 */

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const ALLOWED_ATTRS = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  '*': new Set(['class', 'dir', 'lang']),
};

const URL_SAFE_PROTOCOLS = /^(https?:|mailto:|tel:|\/|#)/i;

function sanitizeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return;

  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // Replace with a span holding the text content rather than dropping silently,
    // so a disallowed <script> doesn't vanish visible text around it.
    const replacement = node.ownerDocument.createTextNode(node.textContent || '');
    node.parentNode?.replaceChild(replacement, node);
    return;
  }

  // Filter attributes
  const toRemove = [];
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    const allowedForTag = ALLOWED_ATTRS[tag] || new Set();
    const allowedGlobal = ALLOWED_ATTRS['*'];
    const isAllowed = allowedForTag.has(name) || allowedGlobal.has(name);
    if (!isAllowed || name.startsWith('on')) {
      toRemove.push(attr.name);
      continue;
    }
    // URL-bearing attributes: only allow safe schemes
    if ((tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')) {
      if (!URL_SAFE_PROTOCOLS.test(value.trim())) {
        toRemove.push(attr.name);
        continue;
      }
    }
  }
  for (const name of toRemove) node.removeAttribute(name);

  // Harden anchor targets
  if (tag === 'a' && node.getAttribute('target') === '_blank') {
    const existingRel = (node.getAttribute('rel') || '').split(/\s+/);
    const required = ['noopener', 'noreferrer'];
    const merged = Array.from(new Set([...existingRel, ...required])).filter(Boolean);
    node.setAttribute('rel', merged.join(' '));
  }

  for (const child of Array.from(node.childNodes)) {
    sanitizeNode(child);
  }
}

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  if (typeof DOMParser === 'undefined') return ''; // SSR guard
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  for (const child of Array.from(root.childNodes)) sanitizeNode(child);
  return root.innerHTML;
}
