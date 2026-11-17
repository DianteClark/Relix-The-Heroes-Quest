// Relix card illustrations: hand-drawn style inline SVG for every treasure and trap.
// Thick #140c1e ink outlines, flat bright fills, one highlight tone. No external files.
//
//   treasureArt(id) → '<svg …>' (or '' if unknown)
//   trapArt(id)     → '<svg …>'
//   ART.treasure[id], ART.trap[id] → inner markup (viewBox 0 0 100 100)
//
// Note: 'skill_counter' exists in both decks, so the two decks are separate maps.

const K = '#140c1e';
const W = '#ffffff';

// ---------------------------------------------------------------- helpers
const r1 = (n) => Math.round(n * 10) / 10;
/** stroke drawn twice: thick ink underneath, colour on top, so lines read as outlined tubes */
const tube = (d, color, w = 6) => `<path d="${d}" fill="none" stroke="${K}" stroke-width="${w + 5}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
/** highlight stroke (no ink) */
const hi = (d, w = 4, c = W, o = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}"${o < 1 ? ` opacity="${o}"` : ''}/>`;
/** four point sparkle */
const spark = (x, y, r, fill = W) => `<path d="M${x} ${r1(y - r)}Q${x} ${y} ${r1(x + r)} ${y}Q${x} ${y} ${x} ${r1(y + r)}Q${x} ${y} ${r1(x - r)} ${y}Q${x} ${y} ${x} ${r1(y - r)}Z" fill="${fill}" stroke-width="2.4"/>`;
const PIPS = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]] };
/** die centred at x,y with side s */
const die = (x, y, s, rot, n, fill = '#fff8e8', pip = K) => {
  const o = s / 100;
  return `<g transform="translate(${r1(x - s / 2)} ${r1(y - s / 2)}) rotate(${rot} ${s / 2} ${s / 2})"><rect x="0" y="0" width="${s}" height="${s}" rx="${r1(s * 0.2)}" fill="${fill}"/>`
    + `<path d="M${r1(s * 0.16)} ${r1(s * 0.84)}V${r1(s * 0.3)}" fill="none" stroke="${W}" stroke-width="${r1(s * 0.07)}" opacity=".9"/>`
    + PIPS[n].map(([px, py]) => `<circle cx="${r1(px * o)}" cy="${r1(py * o)}" r="${r1(s * 0.085)}" fill="${pip}" stroke="none"/>`).join('') + '</g>';
};
/** arrowhead triangle with tip at (x,y) pointing at angle a (deg), size s */
const head = (x, y, a, s = 9, fill = '#ffd23f') => {
  const t = (a * Math.PI) / 180, bx = x - Math.cos(t) * s * 1.3, by = y - Math.sin(t) * s * 1.3;
  const nx = -Math.sin(t) * s, ny = Math.cos(t) * s;
  return `<path d="M${r1(x)} ${r1(y)}L${r1(bx + nx)} ${r1(by + ny)}L${r1(bx - nx)} ${r1(by - ny)}Z" fill="${fill}" stroke-width="3.4"/>`;
};
const bat = (x, y, s, body = '#6a3aa8', wing = '#8a5ad8') => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-4 0C-12-14-28-16-38-6C-30-5-28 0-28 6C-23 1-18 2-14 7C-12 2-8 1-4 4Z" fill="${wing}"/>
  <path d="M4 0C12-14 28-16 38-6C30-5 28 0 28 6C23 1 18 2 14 7C12 2 8 1 4 4Z" fill="${wing}"/>
  <path d="M-7-6L-9-17L-2-10ZM7-6L9-17L2-10Z" fill="${body}" stroke-width="3"/>
  <ellipse cx="0" cy="0" rx="9" ry="11" fill="${body}"/>
  <circle cx="-3.6" cy="-2" r="2.6" fill="#ffe24a" stroke="none"/><circle cx="3.6" cy="-2" r="2.6" fill="#ffe24a" stroke="none"/>
  <path d="M-3 5L-1.6 8L0 5.4L1.6 8L3 5" fill="${W}" stroke-width="1.6"/></g>`;
const rock = (x, y, s, rot = 0, fill = '#a8988a', shade = '#7a6a5e') => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M-20-6C-22-16-12-22-2-21C8-24 18-18 21-8C25 2 20 14 10 18C0 22-14 20-19 12C-24 6-22 0-20-6Z" fill="${fill}"/>
  <path d="M-19 12C-10 18 4 20 12 16C20 12 22 4 21-4C18 6 10 12 0 12C-8 12-14 12-19 12Z" fill="${shade}" stroke="none"/>
  <path d="M-12-12C-8-16-2-17 3-16" fill="none" stroke="${W}" stroke-width="3.4" opacity=".75"/>
  <path d="M-20-6C-22-16-12-22-2-21C8-24 18-18 21-8C25 2 20 14 10 18C0 22-14 20-19 12C-24 6-22 0-20-6Z" fill="none"/></g>`;
/** cartoon glove pointing left in local space, placed at (x,y) rotated by r; fingers: 'pinch' | 'open' */
const hand = (x, y, r = 0, s = 1, c = '#8a5ad8', cuff = '#fff6e2', pose = 'pinch') => {
  const f = pose === 'open'
    ? `<rect x="-24" y="-17" width="30" height="9" rx="4.5" fill="${c}" transform="rotate(-14 4 -12)"/><rect x="-27" y="-8" width="32" height="9" rx="4.5" fill="${c}"/><rect x="-25" y="1" width="30" height="9" rx="4.5" fill="${c}" transform="rotate(10 4 5)"/><rect x="-19" y="9" width="24" height="8" rx="4" fill="${c}" transform="rotate(20 4 13)"/>`
    : `<rect x="-20" y="-15" width="26" height="9.5" rx="4.75" fill="${c}"/><rect x="-14" y="-6" width="20" height="9.5" rx="4.75" fill="${c}"/><rect x="-12" y="3" width="18" height="9" rx="4.5" fill="${c}"/><rect x="-9" y="10" width="15" height="8" rx="4" fill="${c}"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${f}
    <rect x="0" y="-17" width="30" height="36" rx="12" fill="${c}"/>
    <rect x="-16" y="-4" width="22" height="9" rx="4.5" fill="${c}" transform="rotate(${pose === 'open' ? 40 : -28} 4 0)"/>
    <path d="M8 -11C12 -13 18 -13 22 -11" fill="none" stroke="${W}" stroke-width="3" opacity=".55"/>
    <rect x="27" y="-20" width="14" height="42" rx="5" fill="${cuff}"/><path d="M33 -16V18" fill="none" stroke="#d8c8a8" stroke-width="2.4"/></g>`;
};
/** bottle body from the concept art (viewBox 100 x 110 space) */
const flask = (liq, dark) => `<path d="M40 14h20v18c14 6 24 18 24 34 0 22-15 38-34 38S16 88 16 66c0-16 10-28 24-34z" fill="#e8f8ff" stroke-width="4.5"/>
  <path d="M19.5 62c8-6 18 4 30-1s20-6 30 1c1 2 1.5 5 1.5 8 0 19-13 32-31 32S18 89 18 70c0-3 .5-5.5 1.5-8z" fill="${liq}"/>
  <path d="M24 76c4 12 14 20 26 20" fill="none" stroke="${dark}" stroke-width="6"/>
  <circle cx="40" cy="74" r="4" fill="${W}" stroke="none"/><circle cx="58" cy="84" r="2.6" fill="${W}" stroke="none"/>
  ${hi('M28 44c-6 8-7 16-6 22', 5)}
  <rect x="35" y="4" width="30" height="14" rx="4" fill="#c88a4a" stroke-width="4.5"/>`;
const glove = (c = '#8a5ad8', cuff = '#ffd23f') => `<path d="M100 60L74 58L72 86L100 92Z" fill="${cuff}"/>
  ${tube('M60 64L40 54', c, 10)}${tube('M56 72L34 68', c, 10)}${tube('M58 80L38 84', c, 10)}
  <path d="M76 56C62 52 50 58 48 68C46 78 54 86 66 86L76 86Z" fill="${c}"/>${tube('M66 58L60 44', c, 10)}
  <path d="M42 54L46 56M37 68L41 68M41 84L45 83M60 46L61 49" fill="none" stroke="${W}" stroke-width="2.6" opacity=".7"/><path d="M76 58V86" fill="none" stroke="${W}" stroke-width="2.6" opacity=".6"/>`;
const swordV = (len = 1, blade = '#e8f0ff', guard = '#ffd23f', grip = '#8a4a2a') => `<path d="M44 ${14 / len}L50 4L56 ${14 / len}V62H44Z" fill="${blade}"/>
  ${hi('M47.5 16V57', 3)}<path d="M52.5 18V58" stroke="#a8b8d8" stroke-width="2.6" fill="none"/>
  <rect x="30" y="60" width="40" height="9" rx="4.5" fill="${guard}"/><rect x="45" y="69" width="10" height="17" rx="3" fill="${grip}"/><circle cx="50" cy="90" r="6" fill="${guard}"/>`;

// ---------------------------------------------------------------- treasures
const T = {
  potion: `<g transform="translate(14 20) scale(.72)">${flask('#ff3a5a', '#c4123a')}</g>${spark(78, 34, 7)}`,
  super_potion: `<g transform="translate(5 2) scale(.86 .88)">${flask('#3a8cff', '#1a4ac4')}</g>${spark(82, 26, 8)}${spark(16, 30, 5, '#bfe6ff')}`,
  ultra_potion: `<path d="M42 26v10L22 66c-7 11 0 26 15 26h26c15 0 22-15 15-26L58 36V26z" fill="#e8f8ff" stroke-width="4.5"/>
    <path d="M30 56h40l8 12c5 9-1 21-14 21H36c-13 0-19-12-14-21z" fill="#ffc61a"/>
    <path d="M27 76c4 8 10 11 18 11" fill="none" stroke="#e07a00" stroke-width="5"/>
    ${spark(44, 70, 5)}${spark(60, 78, 3.6)}${hi('M38 40L28 56', 5)}
    <rect x="38" y="20" width="24" height="9" rx="3" fill="#c88a4a"/>
    <path d="M34 20l3-14 7 7 6-10 6 10 7-7 3 14z" fill="#ffd23f" stroke-width="3.6"/><circle cx="50" cy="14" r="2.4" fill="#ff3a8a" stroke="none"/>
    ${spark(84, 30, 9, '#fff3a0')}${spark(14, 46, 6)}${spark(86, 66, 5, '#ffd0f0')}`,
  shield: `<path d="M50 10L84 21C84 52 72 76 50 91C28 76 16 52 16 21Z" fill="#4a8cff"/>
    <path d="M50 18L76 26C75 51 66 69 50 81C34 69 25 51 24 26Z" fill="none" stroke="#a8d0ff" stroke-width="4"/>
    <path d="M50 10V91" stroke="${K}" stroke-width="0" fill="none"/>
    <circle cx="50" cy="46" r="11" fill="#ffd23f"/><circle cx="47" cy="43" r="3" fill="${W}" stroke="none"/>
    ${hi('M24 30C25 46 30 58 38 68', 4.5)}`,
  large_shield: `<path d="M50 4L90 16C90 54 76 80 50 96C24 80 10 54 10 16Z" fill="#ffd23f"/>
    <path d="M50 13L81 22C80 53 69 73 50 86C31 73 20 53 19 22Z" fill="#e8304a"/>
    <path d="M28 30L50 50L72 30V44L50 64L28 44Z" fill="${W}"/>
    <circle cx="17" cy="20" r="2.6" fill="${K}" stroke="none"/><circle cx="83" cy="20" r="2.6" fill="${K}" stroke="none"/><circle cx="50" cy="91" r="2.6" fill="${K}" stroke="none"/>
    ${hi('M24 30C25 48 31 62 40 72', 4.5, '#ffb0bc')}${spark(86, 74, 7)}${spark(14, 76, 4.6)}`,
  sword: `<g transform="rotate(38 50 50) translate(0 2)">${swordV()}</g>${spark(20, 24, 6)}`,
  large_sword: `<path d="M50 6C70 18 86 34 92 50C86 66 70 82 50 94C30 82 14 66 8 50C14 34 30 18 50 6Z" fill="#ffe27a" stroke="none" opacity=".55"/>
    <g transform="rotate(-36 50 50) translate(-14 -10) scale(1.28)"><path d="M42 16L50 2L58 16V60H42Z" fill="#e8f0ff"/>${hi('M46 18V56', 3)}<path d="M53 20V57" stroke="#a8b8d8" stroke-width="2.4" fill="none"/>
    <path d="M24 58C30 54 40 60 50 60C60 60 70 54 76 58C72 64 62 68 50 68C38 68 28 64 24 58Z" fill="#ffd23f"/><circle cx="50" cy="63" r="4.4" fill="#3ae0ff"/>
    <rect x="45" y="67" width="10" height="16" rx="3" fill="#6a3aa8"/><path d="M50 84l6 5-6 5-6-5z" fill="#ffd23f"/></g>
    ${spark(80, 20, 8)}${spark(18, 78, 6)}`,
  inner_strength: `<path d="M50 3C57 14 68 12 71 24C79 20 87 28 84 38C93 46 89 62 80 66V96H20V66C11 62 7 46 16 38C13 28 21 20 29 24C32 12 43 14 50 3Z" fill="#ff8a2a"/>
    <path d="M50 16C55 24 62 24 64 32C70 30 74 36 72 42C78 48 76 58 70 62V92H30V62C24 58 22 48 28 42C26 36 30 30 36 32C38 24 45 24 50 16Z" fill="#ffd23f" stroke="none"/>
    <rect x="34" y="70" width="32" height="24" fill="#f0a878"/><rect x="31" y="68" width="38" height="9" rx="3" fill="#e8304a"/>
    <rect x="26" y="40" width="48" height="34" rx="11" fill="#ffc89a"/>
    <rect x="26" y="30" width="13" height="22" rx="6.5" fill="#ffc89a"/><rect x="38" y="28" width="13" height="24" rx="6.5" fill="#ffc89a"/><rect x="50" y="28" width="13" height="24" rx="6.5" fill="#ffc89a"/><rect x="62" y="30" width="12" height="22" rx="6" fill="#ffc89a"/>
    <path d="M27 54C38 48 54 50 62 57C58 64 42 66 28 63Z" fill="#f0a878"/>
    ${hi('M30 34V40M42 32V38M54 32V38M66 34V40', 3)}
    <text x="84" y="94" text-anchor="middle" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="20" fill="${W}" stroke-width="5" paint-order="stroke">x2</text>`,
  ambush: `<g transform="rotate(30 80 30)"><path d="M77 6L83 6L84 40H76Z" fill="#e8f0ff"/><rect x="70" y="38" width="20" height="6" rx="3" fill="#ffd23f"/></g>
    <path d="M12 82C2 72 8 54 22 54C22 38 38 30 50 36C58 26 78 30 80 46C94 48 96 68 86 78C84 86 76 90 70 88H28C20 90 12 88 12 82Z" fill="#3ac46a"/>
    <path d="M22 66C24 60 30 58 34 60M64 46C68 42 74 44 76 48M48 80C52 76 58 76 62 80" fill="none" stroke="#9af0a8" stroke-width="3.6"/>
    <ellipse cx="38" cy="64" rx="9" ry="6.6" fill="${W}"/><circle cx="40" cy="65" r="3.4" fill="${K}" stroke="none"/>
    <ellipse cx="62" cy="64" rx="9" ry="6.6" fill="${W}"/><circle cx="60" cy="65" r="3.4" fill="${K}" stroke="none"/>
    <path d="M28 54L46 60M72 54L54 60" fill="none" stroke-width="4.4"/>
    <path d="M48 14H54L52 30H50Z" fill="#ff3a4a" stroke-width="3"/><circle cx="51" cy="37" r="3" fill="#ff3a4a" stroke-width="2.6"/>`,
  reroll: `${die(32, 60, 34, -14, 2, '#fff8e8')}${die(70, 62, 34, 12, 5, '#fff3c4')}
    ${tube('M18 38C26 18 50 10 70 18', '#3ad0ff', 7)}${head(84, 30, 40, 9, '#3ad0ff')}${spark(14, 84, 5)}`,
  refresh: `${tube('M50 14A36 36 0 0 1 84 44', '#3ac46a', 8)}${head(85, 58, 92, 10, '#3ac46a')}
    ${tube('M50 86A36 36 0 0 1 16 56', '#3ac46a', 8)}${head(15, 42, 272, 10, '#3ac46a')}
    <path d="M55 24L35 54H48L44 78L66 44H53Z" fill="#ffd23f"/>${hi('M52 30L42 48', 3)}`,
  killshot: `<path d="M50 22C32 22 24 34 24 48C24 58 30 64 36 66V78H64V66C70 64 76 58 76 48C76 34 68 22 50 22Z" fill="#f4ecdf"/>
    <ellipse cx="40" cy="48" rx="7" ry="8" fill="${K}"/><ellipse cx="60" cy="48" rx="7" ry="8" fill="${K}"/><path d="M50 57L46 63H54Z" fill="${K}" stroke-width="2"/>
    <path d="M44 70V77M50 70V77M56 70V77" fill="none" stroke-width="3"/>${hi('M32 40C33 33 38 28 44 27', 3.6, '#fff', .9)}
    <circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="10"/><circle cx="50" cy="50" r="38" fill="none" stroke="#ff3a4a" stroke-width="5"/>
    ${tube('M50 2V22M50 78V98M2 50H22M78 50H98', '#ff3a4a', 5)}<circle cx="50" cy="50" r="3" fill="#ff3a4a" stroke-width="2"/>`,
  extra_loot: `<ellipse cx="22" cy="86" rx="10" ry="5" fill="#ffd23f"/><ellipse cx="80" cy="88" rx="10" ry="5" fill="#ffd23f"/><ellipse cx="84" cy="82" rx="9" ry="4.6" fill="#ffe27a"/>
    <path d="M36 32C20 42 13 60 17 76C21 92 79 92 83 76C87 60 80 42 64 32Z" fill="#c88a4a"/>
    <path d="M38 30C33 18 42 13 44 20C46 11 56 11 56 20C58 13 67 17 62 30Z" fill="#c88a4a"/>
    <path d="M35 30C42 35 58 35 65 30L63 38C55 42 45 42 37 38Z" fill="#e8304a"/>
    ${hi('M24 60C24 52 28 46 32 42', 4, '#f0c08a')}
    <circle cx="52" cy="66" r="14" fill="#ffd23f"/><text x="52" y="73" text-anchor="middle" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="17" fill="${K}" stroke="none">+2</text>
    ${spark(84, 22, 8)}${spark(14, 40, 5)}`,
  bomb: `<circle cx="46" cy="60" r="30" fill="#3a3a5a"/>
    <rect x="38" y="24" width="18" height="11" rx="2.5" fill="#6a6a8a" transform="rotate(18 47 29)"/>
    ${tube('M56 26C62 14 72 14 76 20', '#c88a4a', 4)}
    <path d="M78 8L81 15L88 13L83 19L89 24L81 23L78 30L75 23L67 24L73 19L68 13L75 15Z" fill="#ffd23f" stroke-width="2.6"/><circle cx="78" cy="19" r="3" fill="#ff6a2a" stroke="none"/>
    ${hi('M27 52C29 44 35 38 43 36', 5, '#8a8ab8')}<circle cx="27" cy="62" r="3" fill="#8a8ab8" stroke="none"/>`,
  mega_bomb: `<path d="M50 2L58 18L76 8L72 28L94 28L80 42L98 54L78 60L88 80L66 74L62 96L50 80L38 96L34 74L12 80L22 60L2 54L20 42L6 28L28 28L24 8L42 18Z" fill="#ffd23f"/>
    <path d="M50 14L56 26L68 20L66 34L80 36L70 46L82 56L68 60L74 74L60 70L56 84L50 74L44 84L40 70L26 74L32 60L18 56L30 46L20 36L34 34L32 20L44 26Z" fill="#ff8a2a" stroke="none"/>
    <circle cx="50" cy="58" r="27" fill="#2a2a44"/><rect x="42" y="25" width="16" height="10" rx="2.5" fill="#6a6a8a"/>
    <path d="M50 46C42 46 38 51 38 57C38 61 41 63 43 64V68H57V64C59 63 62 61 62 57C62 51 58 46 50 46Z" fill="${W}" stroke-width="3"/>
    <circle cx="45.5" cy="57" r="3.2" fill="${K}" stroke="none"/><circle cx="54.5" cy="57" r="3.2" fill="${K}" stroke="none"/>
    ${hi('M30 52C31 44 36 38 42 36', 4.5, '#7a7aa8')}${tube('M52 26C54 16 60 12 64 12', '#c88a4a', 4)}${spark(68, 10, 7, '#fff')}`,
  skill_counter: `<circle cx="50" cy="50" r="38" fill="#5a4ad8"/><circle cx="50" cy="50" r="29" fill="none" stroke="#a8a0ff" stroke-width="3" stroke-dasharray="5 6"/>
    <path d="M54 22L34 54H47L43 78L66 44H53Z" fill="#ffd23f"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="${K}" stroke-width="14"/><circle cx="50" cy="50" r="38" fill="none" stroke="#ff3a4a" stroke-width="8"/>
    <path d="M23 23L77 77" stroke="${K}" stroke-width="14"/><path d="M23 23L77 77" stroke="#ff3a4a" stroke-width="8"/>${spark(88, 14, 6)}`,
  steal: `<path d="M12 60L18 40H70L76 60Z" fill="#8a4a2a"/><path d="M20 44H68" fill="none" stroke="#c87a4a" stroke-width="3"/>
    <rect x="10" y="60" width="68" height="32" rx="5" fill="#c87a3a"/><path d="M10 72H78" fill="none" stroke-width="4"/>
    <rect x="22" y="58" width="8" height="34" fill="#ffd23f" stroke-width="3.4"/><rect x="58" y="58" width="8" height="34" fill="#ffd23f" stroke-width="3.4"/>
    <rect x="38" y="66" width="12" height="13" rx="3" fill="#ffd23f" stroke-width="3.4"/><circle cx="44" cy="72" r="2" fill="${K}" stroke="none"/>
    ${hi('M16 66V86', 3.4, '#f0b070')}
    <ellipse cx="44" cy="60" rx="28" ry="4" fill="#ffd23f" stroke="none" opacity=".8"/>
    <path d="M44 14L54 26L44 42L34 26Z" fill="#3ae0ff"/><path d="M34 26H54M40 26L44 14L48 26L44 42" fill="none" stroke-width="2.4"/>
    ${hand(62, 28, -24, 0.95, '#6a4ab8', '#fff6e2')}
    <path d="M86 6L98 0M90 16L100 12M94 28L100 26" fill="none" stroke="${W}" stroke-width="3.4" opacity=".85"/>${spark(18, 22, 6)}${spark(28, 46, 4)}`,
  quick_hands: `<path d="M4 34H22M2 48H18M6 62H20" fill="none" stroke="${W}" stroke-width="3.6" opacity=".85"/>
    <g transform="rotate(-18 40 42)"><rect x="24" y="18" width="32" height="46" rx="6" fill="#ffd23f"/><rect x="29" y="23" width="22" height="36" rx="3" fill="#ffe27a" stroke-width="2.6"/>${spark(40, 41, 8, '#fff')}</g>
    ${hand(60, 44, 10, 1, '#e8304a', '#fff6e2')}
    ${die(22, 82, 24, -12, 5, '#fff8e8')}${spark(86, 14, 6)}`,
  swap: `<g transform="rotate(-12 30 50)"><rect x="12" y="26" width="34" height="48" rx="6" fill="#ffd23f"/><rect x="17" y="31" width="24" height="38" rx="3" fill="none" stroke-width="2.6"/><circle cx="29" cy="50" r="7" fill="#ff8a2a" stroke-width="2.6"/></g>
    <g transform="rotate(12 70 50)"><rect x="54" y="26" width="34" height="48" rx="6" fill="#3ad0ff"/><rect x="59" y="31" width="24" height="38" rx="3" fill="none" stroke-width="2.6"/><path d="M71 43L77 50L71 57L65 50Z" fill="#8a5ad8" stroke-width="2.6"/></g>
    ${tube('M26 18C38 6 58 6 70 14', '#3ac46a', 6)}${head(80, 22, 40, 8, '#3ac46a')}
    ${tube('M74 84C62 94 42 94 30 86', '#ff3a8a', 6)}${head(20, 78, 220, 8, '#ff3a8a')}`,
  guild_banner: `<path d="M22 18H78V84L50 72L22 84Z" fill="#e8304a"/>
    <path d="M66 18V76" stroke="#b81a34" stroke-width="7" fill="none"/><path d="M28 24H72V74L50 65L28 74Z" fill="none" stroke="#ffd23f" stroke-width="3"/>
    <path d="M36 52L38 34L45 42L50 30L55 42L62 34L64 52Z" fill="#ffd23f" stroke-width="3.4"/><rect x="36" y="52" width="28" height="6" rx="2" fill="#ffd23f" stroke-width="3"/>
    <rect x="10" y="12" width="80" height="8" rx="4" fill="#a0602a"/><circle cx="10" cy="16" r="5.5" fill="#ffd23f"/><circle cx="90" cy="16" r="5.5" fill="#ffd23f"/>
    ${tube('M50 12V4', '#a0602a', 3)}${hi('M30 28V68', 3.6, '#ff8a9a')}`,
  guild_bomb: `<path d="M8 10H54V54L44 50L38 60L30 50L20 58L16 48L8 52Z" fill="#3a8cff"/><path d="M22 20L28 30L36 18" fill="none" stroke="#ffd23f" stroke-width="4"/>
    <rect x="2" y="5" width="58" height="7" rx="3.5" fill="#a0602a"/>
    <circle cx="60" cy="66" r="25" fill="#3a3a5a"/><rect x="52" y="34" width="15" height="10" rx="2.5" fill="#6a6a8a" transform="rotate(18 60 39)"/>
    ${tube('M68 36C72 26 80 24 84 28', '#c88a4a', 4)}
    <path d="M86 16L89 23L96 21L91 27L97 32L89 31L86 38L83 31L75 32L81 27L76 21L83 23Z" fill="#ffd23f" stroke-width="2.6"/>
    ${hi('M44 58C46 52 50 48 56 46', 4.5, '#8a8ab8')}<path d="M51 66L58 72L66 62" fill="none" stroke="#ff3a4a" stroke-width="4"/>`,
  hyperspeed: `<path d="M34 38C20 26 6 28 2 36C10 38 14 40 16 42C6 44 2 50 4 54C12 52 18 52 22 54C16 58 14 62 16 66C24 62 30 60 34 60Z" fill="${W}"/>
    <path d="M8 46C14 46 20 48 26 50M10 58C16 58 22 58 28 58" fill="none" stroke="#bfe6ff" stroke-width="2.6"/>
    <path d="M36 20H60V56L82 64C90 67 92 78 84 82H36Z" fill="#e8304a"/><path d="M34 82H88V90H34Z" fill="#6a3a2a"/>
    <rect x="32" y="14" width="32" height="10" rx="3" fill="#ffd23f"/>${hi('M42 30V70', 4, '#ff8a9a')}<path d="M60 56L52 66M68 59L62 68" fill="none" stroke-width="3"/>
    <path d="M90 30H100M86 40H100M92 50H100" fill="none" stroke="${W}" stroke-width="3.4" opacity=".7"/>${spark(78, 22, 7, '#ffe27a')}`,
  trickster: `<path d="M24 38C18 20 6 12 2 18C10 20 14 28 18 40Z" fill="#9a4ae8"/><circle cx="3" cy="17" r="5" fill="#ffd23f"/>
    <path d="M76 38C82 20 94 12 98 18C90 20 86 28 82 40Z" fill="#ffd23f"/><circle cx="97" cy="17" r="5" fill="#9a4ae8"/>
    <path d="M36 32C38 16 46 6 50 4C54 6 62 16 64 32Z" fill="#3ac46a"/><circle cx="50" cy="5" r="4.6" fill="#ffd23f"/>
    <ellipse cx="50" cy="62" rx="33" ry="33" fill="#fff4dc"/>
    <path d="M50 29C32 29 17 44 17 62C17 80 32 95 50 95Z" fill="#9a4ae8" opacity=".9"/>
    <ellipse cx="50" cy="62" rx="33" ry="33" fill="none"/>
    <path d="M28 56C32 47 41 47 45 56C40 53 33 53 28 56Z" fill="${K}"/><path d="M55 56C59 47 68 47 72 56C67 53 60 53 55 56Z" fill="${K}"/>
    <path d="M30 70C38 86 62 86 70 70C60 75 40 75 30 70Z" fill="${K}"/><path d="M40 76C46 79 54 79 60 76" fill="none" stroke="${W}" stroke-width="2.6"/>
    <path d="M74 64L78 70L74 76L70 70Z" fill="#ff3a8a" stroke-width="2.4"/>${hi('M60 36C68 38 74 44 78 52', 3.6, '#fff', .9)}`,
  fast_travel: `<ellipse cx="50" cy="52" rx="42" ry="45" fill="#8a8ab0"/>
    <path d="M14 30L24 36M86 30L76 36M50 7V17M12 70L22 66M88 70L78 66M50 97V87" fill="none" stroke-width="3.4"/>
    <ellipse cx="50" cy="52" rx="32" ry="35" fill="#7a3aff"/>
    <path d="M50 52m0-4a4 4 0 1 1-4 4a9 9 0 1 1 9 9a15 15 0 1 1-15-15a21 21 0 1 1 21 21" fill="none" stroke="#3ae0ff" stroke-width="4.6"/>
    ${hi('M24 40C26 30 32 24 40 20', 4, '#c8c8e8')}${spark(78, 22, 7)}${spark(20, 82, 5, '#bfe6ff')}`,
  trap_resist: `<path d="M8 96L16 74L24 96M30 96L38 70L46 96M54 96L62 74L70 96M76 96L84 72L92 96" fill="#b8c0d0" stroke-width="3.4"/>
    <path d="M38 70L41 80L35 82Z" fill="#7a8098" stroke="none"/>
    <circle cx="50" cy="40" r="36" fill="none" stroke="#a8ffd8" stroke-width="3" stroke-dasharray="5 6"/>
    <path d="M50 8L76 18V40C76 56 66 66 50 72C34 66 24 56 24 40V18Z" fill="#2ac0a0"/>
    <path d="M50 16L68 23V40C68 51 61 58 50 63C39 58 32 51 32 40V23Z" fill="#a8ffd8"/>
    <path d="M50 24V56M40 32L50 40L60 32M42 50H58" fill="none" stroke-width="5"/>${spark(84, 12, 7)}${spark(14, 20, 5)}`,
  revival_potion: `<path d="M34 50C18 36 6 40 2 48C10 48 12 52 12 54C4 56 2 62 4 66C12 62 18 62 22 64C18 68 18 72 20 76C30 70 36 64 38 58Z" fill="${W}"/>
    <path d="M66 50C82 36 94 40 98 48C90 48 88 52 88 54C96 56 98 62 96 66C88 62 82 62 78 64C82 68 82 72 80 76C70 70 64 64 62 58Z" fill="${W}"/>
    <rect x="43" y="22" width="14" height="12" fill="#e8f8ff"/><rect x="40" y="14" width="20" height="10" rx="3" fill="#c88a4a"/>
    <ellipse cx="50" cy="7" rx="14" ry="4" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="50" cy="7" rx="14" ry="4" fill="none" stroke="#ffd23f" stroke-width="4"/>
    <path d="M50 92C30 78 18 66 18 51C18 41 26 33 36 33C42 33 47 36 50 40C53 36 58 33 64 33C74 33 82 41 82 51C82 66 70 78 50 92Z" fill="#e8f8ff"/>
    <path d="M50 88C34 76 25 67 22 57C30 52 40 58 50 54C60 50 70 52 78 57C75 67 66 76 50 88Z" fill="#ff5aa8"/>
    <path d="M46 62H54V68H60V76H54V82H46V76H40V68H46Z" fill="${W}" stroke-width="2.6"/>${hi('M26 48C26 42 30 38 34 38', 4)}`,
  // pets render the creature art, but keep a fallback emblem
  pet_golem: '', pet_tezuki: '', pet_kezz: '',
};

// ---------------------------------------------------------------- traps
const P = {
  roar: `${tube('M88 34C96 44 96 60 88 70', '#ffd23f', 5)}${tube('M12 34C4 44 4 60 12 70', '#ffd23f', 5)}${tube('M96 26C100 40 100 64 96 78', '#ffe27a', 3)}${tube('M4 26C0 40 0 64 4 78', '#ffe27a', 3)}
    <path d="M28 30L18 8L40 22Z" fill="#f4ecdf"/><path d="M72 30L82 8L60 22Z" fill="#f4ecdf"/>
    <path d="M50 18C72 18 84 34 84 54C84 76 70 92 50 92C30 92 16 76 16 54C16 34 28 18 50 18Z" fill="#7a4ad8"/>
    <path d="M30 40L44 46M70 40L56 46" fill="none" stroke-width="5"/>
    <ellipse cx="38" cy="47" rx="5" ry="4" fill="#ffe24a"/><ellipse cx="62" cy="47" rx="5" ry="4" fill="#ffe24a"/>
    <ellipse cx="50" cy="70" rx="22" ry="17" fill="#5a0a2a"/><ellipse cx="50" cy="80" rx="12" ry="6" fill="#ff4a6a" stroke="none"/>
    <path d="M30 64L35 72L40 60L45 70L50 58L55 70L60 60L65 72L70 64Z" fill="${W}" stroke-width="2.6"/>
    ${hi('M26 32C30 26 36 22 42 22', 4, '#b08aff')}`,
  giant_boulder: `<ellipse cx="18" cy="88" rx="14" ry="7" fill="#d8c8b0" stroke-width="3"/><ellipse cx="84" cy="90" rx="12" ry="6" fill="#d8c8b0" stroke-width="3"/>
    <path d="M14 46C10 26 28 8 50 8C74 6 92 24 92 48C94 72 76 90 52 92C28 94 16 74 14 46Z" fill="#a8988a"/>
    <path d="M18 66C26 84 44 92 60 90C78 86 90 72 92 54C86 70 70 80 52 80C36 80 24 74 18 66Z" fill="#7a6a5e" stroke="none"/>
    <path d="M14 46C10 26 28 8 50 8C74 6 92 24 92 48C94 72 76 90 52 92C28 94 16 74 14 46Z" fill="none"/>
    <path d="M70 18L64 30L72 36M24 60L32 64" fill="none" stroke-width="3.4"/>
    <path d="M32 40L46 46M74 40L60 46" fill="none" stroke-width="5"/><ellipse cx="40" cy="51" rx="5" ry="5.4" fill="${W}"/><circle cx="41" cy="52" r="2.6" fill="${K}" stroke="none"/>
    <ellipse cx="64" cy="51" rx="5" ry="5.4" fill="${W}"/><circle cx="63" cy="52" r="2.6" fill="${K}" stroke="none"/>
    <path d="M40 68C46 64 56 64 62 68" fill="none" stroke-width="4"/>${hi('M26 30C30 22 38 16 46 15', 5, '#d8c8b8')}`,
  land_slide: `<path d="M0 100V30L64 100Z" fill="#6a8a4a"/><path d="M0 30L64 100H46L0 50Z" fill="#8aa85a" stroke="none"/><path d="M0 100V30L64 100" fill="none"/>
    <path d="M6 22C12 26 16 32 16 38M30 40C36 44 40 50 40 54M56 60C62 64 66 70 66 74" fill="none" stroke="${W}" stroke-width="3.4" opacity=".85"/>
    ${rock(20, 28, 0.62, -20)}${rock(46, 52, 0.85, 10)}${rock(76, 74, 1.15, 30)}${rock(88, 42, 0.42, -10)}${rock(64, 22, 0.3, 40)}
    <ellipse cx="76" cy="95" rx="22" ry="5" fill="#e8dcc8" stroke-width="3"/><circle cx="54" cy="94" r="5" fill="#e8dcc8" stroke-width="2.6"/><circle cx="96" cy="92" r="4" fill="#e8dcc8" stroke-width="2.6"/>`,
  endless_pit: `<ellipse cx="50" cy="64" rx="46" ry="24" fill="#8ab8b0"/>
    <ellipse cx="50" cy="60" rx="36" ry="17" fill="#2a1a4a"/><ellipse cx="50" cy="62" rx="22" ry="9" fill="#120a24" stroke="none"/>
    <path d="M30 56c10 6 30 6 40 0" fill="none" stroke="#c88aff" stroke-width="3"/>
    <g stroke-width="3.4"><path d="M4 62l12-8 10 6-5 11-13 1z" fill="#b8e8d8"/><path d="M76 52l13-4 8 8-7 10-12-3z" fill="#9ad8c8"/><path d="M30 80l11-4 9 5-4 9-13 0z" fill="#b8e8d8"/><path d="M58 82l12-3 7 6-7 7-11-3z" fill="#9ad8c8"/></g>
    <g fill="#b8e8d8" stroke-width="3"><path d="M44 18l8 3-2 8-8-2z"/><path d="M60 30l6 1 0 6-6 0z"/><path d="M34 32l5 3-3 5-5-3z"/></g>`,
  restart: `<ellipse cx="50" cy="80" rx="18" ry="6" fill="#8a8ab0"/><rect x="45" y="28" width="6" height="52" rx="3" fill="#a0602a"/>
    <path d="M51 30H76L69 40L76 50H51Z" fill="#3ac46a"/><path d="M57 36H66" fill="none" stroke="${W}" stroke-width="3"/>
    ${tube('M77.6 30.9A36 36 0 1 0 83.8 66.3', '#ffd23f', 7)}${head(87.5, 57, -70, 10, '#ffd23f')}`,
  skill_counter: `<path d="M56 6L28 52H46L40 94L74 40H56Z" fill="#ffd23f"/>${hi('M52 14L36 42', 3.6)}
    <g fill="none"><g stroke-width="11"><path d="M8 30L92 64"/></g><g stroke="#b8c0d0" stroke-width="6"><path d="M8 30L92 64"/></g></g>
    <g fill="#d8dce8" stroke-width="3.4"><ellipse cx="22" cy="36" rx="8" ry="5" transform="rotate(22 22 36)"/><ellipse cx="78" cy="58" rx="8" ry="5" transform="rotate(22 78 58)"/></g>
    <path d="M42 62V54C42 46 58 46 58 54V62" fill="none" stroke="${K}" stroke-width="10"/><path d="M42 62V54C42 46 58 46 58 54V62" fill="none" stroke="#b8c0d0" stroke-width="5"/>
    <rect x="34" y="60" width="32" height="26" rx="5" fill="#8a5ad8"/><circle cx="50" cy="70" r="4" fill="${K}" stroke="none"/><path d="M50 72V79" stroke="${K}" stroke-width="3.4"/>`,
  boulder: `<path d="M26 4V20M40 0V14M54 4V18M68 0V12" fill="none" stroke="${W}" stroke-width="3.4" opacity=".75"/>
    ${rock(50, 52, 1.55, 14)}
    <path d="M56 30L50 40L57 46L51 56" fill="none" stroke-width="3.4"/>
    ${rock(14, 80, 0.32, 20)}${rock(86, 76, 0.26, -30)}${rock(80, 90, 0.18, 10)}
    <ellipse cx="50" cy="94" rx="28" ry="4.4" fill="${K}" opacity=".3" stroke="none"/>`,
  double_battle: `<g transform="rotate(40 50 50)">${swordV(1, '#e8f0ff', '#ffd23f', '#8a4a2a')}</g><g transform="rotate(-40 50 50)">${swordV(1, '#e8f0ff', '#ff8a2a', '#3a2a6a')}</g>
    <circle cx="76" cy="78" r="16" fill="#ff3a4a"/><text x="76" y="86" text-anchor="middle" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="20" fill="${W}" stroke="none">x2</text>
    ${spark(50, 14, 6)}`,
  double_loss: `<rect x="22" y="6" width="56" height="10" rx="4" fill="#a0602a"/><rect x="22" y="84" width="56" height="10" rx="4" fill="#a0602a"/>
    <path d="M30 16H70C70 34 58 42 54 50C58 58 70 66 70 84H30C30 66 42 58 46 50C42 42 30 34 30 16Z" fill="#e8f8ff"/>
    <path d="M36 24H64C62 34 54 40 50 46C46 40 38 34 36 24Z" fill="#ffc23a" stroke-width="3"/><path d="M38 82C40 72 46 70 50 70C54 70 60 72 62 82Z" fill="#ffc23a" stroke-width="3"/>
    <path d="M50 50V68" stroke="#ffc23a" stroke-width="3" stroke-dasharray="2 3"/>${hi('M34 20C35 30 40 36 44 40', 3.4)}
    <path d="M62 40L58 50L64 58" fill="none" stroke-width="3"/>
    <circle cx="80" cy="74" r="16" fill="#ff3a4a"/><text x="80" y="82" text-anchor="middle" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="20" fill="${W}" stroke="none">x2</text>`,
  let_down: `<path d="M46 88C28 76 10 62 10 42C10 28 20 18 32 18C40 18 46 22 50 30L42 44L52 54L44 66L52 74Z" fill="#ff3a5a" transform="translate(-4 2) rotate(-8 30 50)"/>
    <path d="M54 88C72 76 90 62 90 42C90 28 80 18 68 18C60 18 54 22 50 30L42 44L52 54L44 66L52 74Z" fill="#ff3a5a" transform="translate(4 2) rotate(8 70 50)"/>
    ${hi('M18 38C18 30 24 26 30 26', 4.5, '#ffb0bc')}
    <path d="M26 92C24 86 28 82 30 80C32 82 36 86 34 92C32 96 28 96 26 92Z" fill="#7ad8ff" stroke-width="2.6"/><path d="M74 96C72 90 76 86 78 84C80 86 84 90 82 96C80 99 76 99 74 96Z" fill="#7ad8ff" stroke-width="2.6"/>`,
  spike_trap: `<path d="M4 78H96V94H4Z" fill="#8a7a6a"/><path d="M4 86H96" fill="none" stroke="#6a5a4a" stroke-width="3"/>
    <g fill="#d8dce8"><path d="M10 78L20 34L30 78Z"/><path d="M30 78L40 18L50 78Z"/><path d="M50 78L60 26L70 78Z"/><path d="M70 78L80 38L90 78Z"/></g>
    <g fill="none" stroke="${W}" stroke-width="3"><path d="M19 44L16 70M39 30L35 70M59 36L56 70M79 48L76 70"/></g>
    <g fill="#9aa0b8" stroke="none"><path d="M22 76L20 40L28 76Z"/><path d="M42 76L40 26L48 76Z"/><path d="M62 76L60 32L68 76Z"/><path d="M82 76L80 44L88 76Z"/></g>
    ${spark(40, 12, 6)}`,
  bat_swarm: `${bat(30, 30, 0.75)}${bat(72, 46, 1)}${bat(34, 74, 0.85, '#4a2a88', '#7a4ac8')}${bat(82, 14, 0.45, '#4a2a88', '#7a4ac8')}${bat(10, 52, 0.4)}`,
  lose_a_turn: `<rect x="44" y="6" width="12" height="8" rx="2" fill="#a0602a"/><path d="M74 18L80 12L86 18L80 24Z" fill="#a0602a"/>
    <circle cx="50" cy="54" r="38" fill="#ffd23f"/><circle cx="50" cy="54" r="30" fill="#fff8e8"/>
    <path d="M50 30V54L64 62" fill="none" stroke-width="5"/><circle cx="50" cy="54" r="4" fill="${K}" stroke="none"/>
    <path d="M50 26V30M50 78V82M22 54H26M74 54H78" fill="none" stroke-width="3"/>
    <path d="M18 24L82 86" stroke="${K}" stroke-width="15"/><path d="M18 24L82 86" stroke="#ff3a4a" stroke-width="9"/>
    <text x="88" y="38" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="14" fill="${W}" stroke-width="4" paint-order="stroke">Z</text>`,
  surprise: `<path d="M18 52H82V92H18Z" fill="#e8304a"/><path d="M44 52H56V92H44Z" fill="#ffd23f"/>
    <path d="M22 52H78V60H22Z" fill="#120a24" stroke="none"/>
    <ellipse cx="38" cy="56" rx="5" ry="3.4" fill="#ffe24a" stroke="none"/><ellipse cx="62" cy="56" rx="5" ry="3.4" fill="#ffe24a" stroke="none"/>
    <g transform="rotate(-24 20 40)"><path d="M12 30H84V44H12Z" fill="#e8304a"/><path d="M42 30H54V44H42Z" fill="#ffd23f"/>
    <path d="M48 30C38 16 26 18 30 26C32 30 40 30 48 30C56 30 64 30 66 26C70 18 58 16 48 30Z" fill="#ffd23f"/></g>
    <text x="80" y="30" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="26" fill="#ffd23f" stroke-width="5" paint-order="stroke">!</text>
    ${hi('M24 64V86', 4, '#ff8a9a')}`,
  poison_dart: `<g transform="rotate(-42 50 50)"><path d="M50 2L58 22H42Z" fill="#d8dce8"/>${hi('M48 8L46 18', 2.6)}<rect x="44" y="20" width="12" height="40" rx="3" fill="#a0602a"/><path d="M44 30H56M44 40H56" fill="none" stroke-width="2.6"/>
    <path d="M44 56L26 84L44 76ZM56 56L74 84L56 76Z" fill="#3ac46a"/><path d="M44 56H56V84H44Z" fill="#8af08a"/></g>
    <path d="M70 18C70 24 76 28 76 34C76 39 70 41 67 38C64 35 65 28 70 18Z" fill="#7aff5a" stroke-width="3"/>
    <path d="M84 40C84 45 88 48 88 52C88 56 84 57 82 55C79 53 80 47 84 40Z" fill="#7aff5a" stroke-width="3"/>
    <circle cx="20" cy="80" r="11" fill="#7aff5a"/><circle cx="16.5" cy="76.5" r="3.4" fill="${W}" stroke="none"/><circle cx="36" cy="92" r="5.6" fill="#7aff5a" stroke-width="3"/><circle cx="8" cy="64" r="4" fill="#7aff5a" stroke-width="2.6"/>`,
  fumble: `${hand(66, 30, 34, 0.95, '#3a8cff', '#fff6e2', 'open')}
    <path d="M48 46C40 52 36 58 34 66M56 52C54 60 54 66 56 72" fill="none" stroke="${W}" stroke-width="3.4" stroke-dasharray="1 7" opacity=".9"/>
    <g transform="rotate(-34 26 74)"><rect x="13" y="56" width="26" height="36" rx="5" fill="#ffd23f"/><rect x="17.5" y="60.5" width="17" height="27" rx="3" fill="none" stroke-width="2.4"/><circle cx="26" cy="74" r="5.4" fill="#ff8a2a" stroke-width="2.4"/></g>
    <g transform="rotate(26 62 82)"><rect x="50" y="66" width="24" height="33" rx="5" fill="#3ad0ff"/><rect x="54.5" y="70.5" width="15" height="24" rx="3" fill="none" stroke-width="2.4"/><path d="M62 75L67 82L62 89L57 82Z" fill="#8a5ad8" stroke-width="2.4"/></g>
    <path d="M90 50C90 55 95 58 95 63C95 67 90 68 88 66C85 64 86 58 90 50Z" fill="#7ad8ff" stroke-width="2.6"/>
    <text x="8" y="34" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="24" fill="#ffd23f" stroke-width="5" paint-order="stroke">?!</text>`,
  misstep: `<g fill="#aef0d4"><rect x="4" y="64" width="26" height="22" rx="5"/><rect x="37" y="64" width="26" height="22" rx="5"/><rect x="70" y="64" width="26" height="22" rx="5"/></g>
    <g fill="#5e9a8a" stroke="none"><rect x="6" y="80" width="22" height="4" rx="2"/><rect x="39" y="80" width="22" height="4" rx="2"/><rect x="72" y="80" width="22" height="4" rx="2"/></g>
    <path d="M4 92H96" fill="none" stroke-width="4"/>
    <g transform="translate(83 66) scale(1.35)"><path d="M0 -2C-6 -12-14-14-18-10C-12-8-8-4-4 0Z" fill="#ffd23f" stroke-width="3"/><path d="M0 -2C6 -12 14-14 18-10C12-8 8-4 4 0Z" fill="#ffd23f" stroke-width="3"/>
      <path d="M-5 0C-4-12 4-12 5 0Z" fill="#fff3a0" stroke-width="3"/><rect x="-2" y="-16" width="4" height="6" rx="1.5" fill="#8a5a2a" stroke-width="2.4"/></g>
    ${tube('M80 52C70 22 30 20 18 50', '#ff3a4a', 7)}${head(16, 60, 104, 10, '#ff3a4a')}
    <circle cx="50" cy="26" r="14" fill="#ff3a4a"/><text x="50" y="33" text-anchor="middle" font-family="Luckiest Guy, Lilita One, sans-serif" font-size="19" fill="${W}" stroke="none">-3</text>
    <path d="M86 40L92 34M90 48L98 46" fill="none" stroke="${W}" stroke-width="3" opacity=".85"/>`,
};

export const ART = { treasure: T, trap: P };

const wrap = (inner, label) => `<svg class="cs-svg" viewBox="0 0 100 100" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><g stroke="${K}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;
export const treasureArt = (id) => (T[id] ? wrap(T[id], id.replace(/_/g, ' ')) : '');
export const trapArt = (id) => (P[id] ? wrap(P[id], id.replace(/_/g, ' ')) : '');
