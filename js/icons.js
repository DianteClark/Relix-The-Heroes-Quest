// Hand-inked SVG icons (no emoji anywhere in the UI).
const S = (body, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const ink = 'stroke="#140c1e" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

export const ICON = {
  menu: S(`<path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`),
  close: S(`<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`),
  card: S(`<rect x="5" y="3" width="12" height="17" rx="2" fill="#a39b00" ${ink}/><rect x="8" y="6" width="6" height="5" rx="1" fill="#5c5046"/>`),
  gem: S(`<path d="M12 2l7 9-7 11-7-11z" fill="#f2c443" ${ink}/><path d="M12 2v20M5 11h14" stroke="#fff3b0" stroke-width="1.2" opacity=".8"/>`),
  hourglass: S(`<path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9" fill="#f4ecdf" ${ink}/>`),
  heartbreak: S(`<path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 9c0 6-8 11-8 11z" fill="#e5484d" ${ink}/><path d="M12 6.5l-1.5 4 3 2-2 4" fill="none" stroke="#140c1e" stroke-width="2"/>`),
  blocked: S(`<circle cx="12" cy="12" r="8.5" fill="#f4ecdf" ${ink}/><path d="M6.2 6.2l11.6 11.6" stroke="#e5484d" stroke-width="3"/>`),
  swords: S(`<path d="M4 4l10 10M20 4L10 14" stroke="#dfe6f0" stroke-width="3.2" stroke-linecap="round"/><path d="M4 4l10 10M20 4L10 14" fill="none" stroke="#140c1e" stroke-width="1" /><path d="M12 16l-4 4M12 16l4 4M7 14l3 3M17 14l-3 3" stroke="#8a5a0a" stroke-width="2.6" stroke-linecap="round"/>`),
  crown: S(`<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="#f2c443" ${ink}/>`),
  dice: S(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#f4ecdf" ${ink}/><circle cx="8.5" cy="8.5" r="1.7" fill="#140c1e"/><circle cx="12" cy="12" r="1.7" fill="#140c1e"/><circle cx="15.5" cy="15.5" r="1.7" fill="#140c1e"/>`),
};
