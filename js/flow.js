// Cinematic beats between moves: turn banners, card reveals, floor intros, relic claims.
// Every beat returns a promise. Human-facing beats wait for a tap; bot beats auto-advance.
import { treasureCard, trapCard, cardBack, bossFront, bossBack } from './cards.js';
import { heroDef } from './data.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced-motion');

export class Flow {
  constructor({ sfx = () => {}, haptics = null, speed = () => 1 } = {}) {
    this.sfx = sfx;
    this.haptics = haptics;
    this.speed = speed;
    this.root = document.createElement('div');
    this.root.id = 'flow';
    document.body.appendChild(this.root);
  }

  // Waits for a deliberate tap anywhere on the overlay (ignores the first 350ms so
  // a tap that triggered the beat can't skip it by accident).
  waitTap(el, maxMs = 9000) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let down = null;
      const done = () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); clearTimeout(timer); resolve(); };
      const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
      const onUp = (e) => {
        if (performance.now() - t0 < 350) return;
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 24) return;
        this.haptics?.tap();
        this.sfx('tap');
        done();
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      const timer = setTimeout(done, maxMs);
    });
  }

  layer(cls, html) {
    const el = document.createElement('div');
    el.className = `flow-layer ${cls}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    return el;
  }
  async remove(el, ms = 260) {
    el.classList.add('out');
    await sleep(reduced() ? 0 : ms);
    el.remove();
  }

  async turn(p, { human, guild } = {}) {
    const sp = this.speed();
    const hero = heroDef(p.hero);
    const el = this.layer(`turn ${human ? 'mine' : ''}`, `
      <div class="turn-band" style="--gcol:${guild ? guild.color : '#f2c443'}">
        <img class="turn-art" src="assets/chars/${hero.art}.webp" alt="">
        <div class="turn-text"><small>${human ? 'Your move' : hero.role}</small><b>${esc(p.name)}'s Turn</b></div>
      </div>`);
    this.sfx('turn');
    if (human) this.haptics?.select();
    await sleep(human ? 1150 : Math.max(380, 900 * sp));
    await this.remove(el);
  }

  async cards(p, cards, { human, why, hidden } = {}) {
    if (!cards.length) return;
    if (hidden) return this.hiddenCards(p, cards.length, why);
    const sp = this.speed();
    const el = this.layer('reveal treasure', `
      <div class="rv-title">${esc(p.name)} ${cards.length > 1 ? `draws ${cards.length} treasures` : 'finds a treasure'}${why ? ` <small>${esc(why)}</small>` : ''}</div>
      <div class="rv-cards">${cards.map((c, i) => `
        <div class="flip" style="--i:${i}"><div class="flip-in">
          <div class="flip-face back">${cardBack('Treasure')}</div>
          <div class="flip-face front">${treasureCard(c.id)}</div>
        </div></div>`).join('')}</div>
      ${human ? '<div class="rv-hint">Tap to collect</div>' : ''}`);
    this.sfx('card_draw');
    await sleep(reduced() ? 0 : 380);
    el.classList.add('flipped');
    this.sfx('card_flip');
    if (human) this.haptics?.success();
    await sleep(500);
    if (human) await this.waitTap(el);
    else await sleep(Math.max(350, 1100 * sp));
    el.classList.add('collect');
    this.sfx('coin');
    await this.remove(el, 420);
  }

  // Another player's draw: everyone sees that cards were drawn, nobody sees which.
  async hiddenCards(p, n, why) {
    const el = this.layer('reveal treasure hidden', `
      <div class="rv-title">${esc(p.name)} ${n > 1 ? `draws ${n} treasures` : 'draws a treasure'}${why ? ` <small>${esc(why)}</small>` : ''}</div>
      <div class="rv-cards">${Array.from({ length: n }, (_, i) => `<div class="flip" style="--i:${i}"><div class="flip-in"><div class="flip-face back">${cardBack('Treasure')}</div></div></div>`).join('')}</div>`);
    this.sfx('card_draw');
    await sleep(Math.max(500, 1000 * this.speed()));
    el.classList.add('collect');
    await this.remove(el, 380);
  }

  async trap(p, card, { human } = {}) {
    const sp = this.speed();
    const el = this.layer('reveal trap', `
      <div class="rv-title red">Trap!</div>
      <div class="rv-cards"><div class="flip"><div class="flip-in">
        <div class="flip-face back">${cardBack('Trap')}</div>
        <div class="flip-face front">${trapCard(card.id)}</div>
      </div></div></div>
      ${human ? '<div class="rv-hint">Tap to continue</div>' : ''}`);
    this.sfx('trap');
    await sleep(reduced() ? 0 : 320);
    el.classList.add('flipped');
    this.sfx('card_flip');
    this.haptics?.impact(2);
    await sleep(500);
    if (human) await this.waitTap(el);
    else await sleep(Math.max(400, 1300 * sp));
    await this.remove(el);
  }

  async floor(f, boss, { human } = {}) {
    const t = boss.theme;
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const el = this.layer('floor-intro', `
      <div class="fi-bg" style="--sky:${hex(t.sky)};--accent:${hex(t.accent)};--fog:${hex(t.fog)}"></div>
      <div class="fi-rays" style="--accent:${hex(t.accent)}"></div>
      <div class="fi-text"><small>Floor ${f} of 5</small><h1>${esc(t.name)}</h1></div>
      <img class="fi-boss" src="assets/chars/${boss.art}.webp" alt="">
      <div class="fi-name"><b>${esc(boss.name)}</b><span>${boss.hp} HP · Attack ${boss.atk}</span><p>${esc(boss.skill.replace(/^Every third battle roll /, 'Every 3rd roll: '))}</p></div>
      ${human ? '<div class="rv-hint">Tap to enter the dungeon</div>' : ''}`);
    this.sfx('boss_roar');
    this.haptics?.impact(2);
    await sleep(1400);
    if (human) await this.waitTap(el, 12000);
    else await sleep(Math.max(600, 1600 * this.speed()));
    await this.remove(el, 500);
  }

  async bossSkill(boss) {
    const el = this.layer('boss-skill', `<div class="bs-flash"></div><div class="bs-card">${bossBack(boss)}</div><div class="bs-title">${esc(boss.name)} unleashes its skill!</div>`);
    this.sfx('boss_skill');
    this.haptics?.impact(2);
    await sleep(Math.max(900, 1700 * this.speed()));
    await this.remove(el);
  }

  async relic(p, relic, { human } = {}) {
    const hero = heroDef(p.hero);
    const el = this.layer('relic-scene', `
      <div class="rl-rays"></div>
      <div class="rl-gem"><i></i></div>
      <img class="rl-hero" src="assets/chars/${hero.art}.webp" alt="">
      <div class="rl-text"><small>Relic claimed</small><h1>${esc(relic.name)}</h1><p>${esc(p.name)} landed the killing blow!</p></div>
      <div class="rl-spark">${Array.from({ length: 24 }, (_, i) => `<i style="--a:${i * 15}deg;--d:${(i % 5) * 0.12}s"></i>`).join('')}</div>
      ${human ? '<div class="rv-hint">Tap to continue</div>' : ''}`);
    this.sfx('relic');
    this.haptics?.success();
    await sleep(1600);
    if (human) await this.waitTap(el);
    else await sleep(Math.max(900, 1800 * this.speed()));
    await this.remove(el, 500);
  }

  // One-time coach tips. Stored per device so each shows once.
  async tip(key, title, text, art) {
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem('relix.tips.v1') || '{}'); } catch { /* ignore */ }
    if (seen[key]) return;
    seen[key] = 1;
    try { localStorage.setItem('relix.tips.v1', JSON.stringify(seen)); } catch { /* ignore */ }
    const el = this.layer('tip', `<div class="tip-card">${art ? `<img src="assets/chars/${art}.webp" alt="">` : ''}<div><small>Tip</small><b>${esc(title)}</b><p>${esc(text)}</p><span class="rv-hint">Tap to continue</span></div></div>`);
    this.sfx('open');
    await this.waitTap(el, 20000);
    await this.remove(el);
  }

  async banner(text, color = '') {
    const el = this.layer(`callout ${color}`, `<div>${text}</div>`);
    await sleep(Math.max(700, 1300 * this.speed()));
    await this.remove(el);
  }
}
