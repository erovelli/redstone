#!/usr/bin/env node
// npm run test:browser  ->  builds dist/, opens dist/index.html in Chromium and operates the reference components
// by mouse and by keyboard: properties, events, form values, disabled, reduced motion, the content opening,
// and no console errors. Skipped (exit 0) when Playwright is not installed. Not part of CI.
'use strict';
const path = require('path');
const { build } = require('./build.js');

let playwright;
try { playwright = require('playwright'); } catch (e) {
  console.log('Playwright is not installed: browser smoke test skipped.');
  process.exit(0);
}

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || extra === undefined ? '' : '  ' + JSON.stringify(extra)}`);
}

async function open(browser, opts = {}) {
  const page = await browser.newPage(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, opts));
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  // Record every event page code could see (bubble phase, as page code normally listens).
  await page.evaluate(() => {
    window.__events = [];
    for (const type of ['click', 'input', 'change', 'toggle', 'submit', 'reset']) {
      document.addEventListener(type, ev => {
        const t = ev.target;
        const name = t.getAttribute && (t.getAttribute('name') || t.textContent.trim());
        const rec = { type, tag: t.localName, name, checked: t.checked, active: t.active, value: t.value };
        if (type === 'submit') {
          ev.preventDefault();
          rec.data = [...new FormData(t)].map(([k, v]) => k + '=' + v).join('&');
        }
        window.__events.push(rec);
      });
    }
  });
  return { page, errors };
}
const events = page => page.evaluate(() => window.__events.splice(0));
const until = async (page, fn, arg, timeout = 4000) => {
  try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { return false; }
};

async function main() {
  build();
  const browser = await playwright.chromium.launch();

  console.log('\nrs-toggle');
  {
    const { page, errors } = await open(browser);
    const fan = 'rs-toggle[name="fan"]';
    await page.locator(fan).scrollIntoViewIfNeeded();
    check('starts unchecked, no checked attribute', await page.$eval(fan, el => el.checked === false && !el.hasAttribute('checked')));
    // Mouse: the click is a lever flip; `checked` must not change in the click handler itself.
    const sameTurn = await page.$eval(fan, el => { el.shadowRoot.querySelector('.hit').click(); return el.checked; });
    check('a click does not change checked directly', sameTurn === false);
    check('checked follows the lamp', await until(page, s => document.querySelector(s).checked === true, fan));
    const ev = await events(page);
    check('one input and one change event, after the lamp lit', ev.filter(e => e.type === 'change' && e.name === 'fan').length === 1 && ev.filter(e => e.type === 'input' && e.name === 'fan').length === 1 && ev.every(e => e.type !== 'change' || e.checked === true), ev);
    check('raw clicks never reach the page', !ev.some(e => e.type === 'click'), ev);
    check('checked attribute and aria-checked reflect the output', await page.$eval(fan, el => el.hasAttribute('checked') && el.shadowRoot.querySelector('.hit').getAttribute('aria-checked') === 'true'));
    // Real mouse click on the lever.
    await page.locator(fan + ' >> .hit').click();
    check('mouse click turns it off again', await until(page, s => document.querySelector(s).checked === false, fan));
    // Keyboard.
    await page.locator(fan + ' >> .hit').focus();
    await page.keyboard.press('Space');
    check('Space flips the lever', await until(page, s => document.querySelector(s).checked === true, fan));
    await page.keyboard.press('Enter');
    check('Enter flips it back', await until(page, s => document.querySelector(s).checked === false, fan));
    check('the control has role switch and a name', await page.$eval(fan, el => { const b = el.shadowRoot.querySelector('.hit'); return b.getAttribute('role') === 'switch' && b.getAttribute('aria-label') === 'Fan'; }));
    check('state is announced', await page.$eval(fan, el => /Fan (on|off)/.test(el.shadowRoot.querySelector('[aria-live]').textContent)));
    // Programmatic set: settles at once, no events.
    await events(page);
    check('el.checked = true is true at once', await page.$eval(fan, el => { el.checked = true; return el.checked && el.contraption.io.lamp.lit; }));
    await page.waitForTimeout(300);
    check('a programmatic set fires no events', !(await events(page)).some(e => e.name === 'fan'));
    // Disabled.
    const alarm = 'rs-toggle[name="alarm"]';
    check('disabled: control is disabled', await page.$eval(alarm, el => el.shadowRoot.querySelector('.hit').disabled));
    await page.$eval(alarm, el => el.click());
    await page.waitForTimeout(400);
    check('disabled: a click does nothing', await page.$eval(alarm, el => el.checked === false && !el.contraption.io.lever.on));
    check('--rs-block sets the block size per element', await page.$eval(fan, el => {
      const before = el.contraption.view.B;
      el.style.setProperty('--rs-block', '36px');
      return before === 24 && el.contraption.view.B === 36 && el.shadowRoot.querySelector('canvas').width >= 36 * 4;
    }));
    const td = await page.$eval(fan, el => {
      const t = Redstone.ui.ticker, n = t.members.size, parent = el.parentNode, next = el.nextSibling;
      el.remove();
      const gone = t.members.size === n - 1 && !el.contraption && !el.shadowRoot.querySelector('canvas');
      parent.insertBefore(el, next);
      return [gone, t.members.size === n, el.checked, el.contraption && el.contraption.io.lever.on].join();
    });
    check('teardown on disconnect, rebuild on reconnect (state kept through the attribute)', td === 'true,true,true,true', td);
    const theme0 = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('#lights >> .hit').click();
    check('the docs theme switch follows its lamp', await until(page, t => document.documentElement.dataset.theme !== t, theme0));
    check('element.contraption exposes world, io and entry', await page.$eval(fan, el => !!(el.contraption.world && el.contraption.io.lever && el.contraption.entry.id === 'ui-toggle')));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-button in a form');
  {
    const { page, errors } = await open(browser);
    const news = 'rs-toggle[name="newsletter"]', save = 'rs-button[type="submit"]', reset = 'rs-button[type="reset"]';
    await page.locator(save).scrollIntoViewIfNeeded();
    // Keyboard only: tab to the toggle and the button.
    await page.locator(news + ' >> .hit').focus();
    await page.keyboard.press('Space');
    check('keyboard: toggle checked', await until(page, s => document.querySelector(s).checked, news));
    check('form value present while checked', await page.$eval(news, el => new FormData(el.form).get('newsletter') === 'yes'));
    await events(page);
    await page.keyboard.press('Tab');
    check('Tab moves focus to the Save button control', await page.evaluate(s => document.activeElement === document.querySelector(s), save));
    await page.keyboard.press('Enter');
    check('click fires on the rising edge of the lamp', await until(page, () => window.__events.some(e => e.type === 'click' && e.tag === 'rs-button')));
    check('the form submits with the toggle value', await until(page, () => window.__events.some(e => e.type === 'submit')));
    let ev = await events(page);
    const clicks = ev.filter(e => e.type === 'click');
    check('exactly one click, while active', clicks.length === 1 && clicks[0].active === true, ev);
    check('submit data', (ev.find(e => e.type === 'submit') || {}).data === 'newsletter=yes', ev);
    check('the button settles back to inactive', await until(page, s => document.querySelector(s).active === false, save));
    // Mouse: reset.
    await page.locator(reset + ' >> .hit').click();
    check('mouse: reset button resets the form (toggle back to default)', await until(page, s => document.querySelector(s).checked === false, news, 6000));
    ev = await events(page);
    check('reset fired once', ev.filter(e => e.type === 'reset').length === 1, ev);
    // Clicking twice quickly is one press while the button is in.
    await events(page);
    await page.locator(save + ' >> .hit').click();
    await page.locator(save + ' >> .hit').click();
    await page.waitForTimeout(1600);
    ev = await events(page);
    check('two quick clicks give one press, one click event', ev.filter(e => e.type === 'click').length === 1, ev);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-button signs (SPEC I3)');
  for (const width of [1280, 320]) {
    const { page, errors } = await open(browser, { viewport: { width, height: 900 } });
    const sizes = await page.$$eval('rs-button', els => els.map(el => parseFloat(getComputedStyle(el.shadowRoot.querySelector('.label')).fontSize)));
    check(`sign text is at least 12 CSS px at ${width} px`, sizes.length > 0 && sizes.every(s => s >= 12), sizes);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nreduced motion');
  {
    const { page, errors } = await open(browser, { reducedMotion: 'reduce' });
    const fan = 'rs-toggle[name="fan"]';
    const at = await page.$eval(fan, el => { el.shadowRoot.querySelector('.hit').click(); return el.checked; });
    check('an input settles at once', at === true);
    const ev = await events(page);
    check('and still fires change', ev.some(e => e.type === 'change' && e.name === 'fan'), ev);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\ncontent opening (core test element)');
  {
    const { page, errors } = await open(browser);
    const hatch = '#hatch';
    await page.locator(hatch).scrollIntoViewIfNeeded();
    check('starts closed with the window hidden', await page.$eval(hatch, el => el.open === false && el.shadowRoot.querySelector('.window').hidden));
    await page.locator(hatch + ' >> .hit').click();
    check('opens when the covers are clear', await until(page, s => document.querySelector(s).open === true, hatch));
    check('window shown only when the opening is clear', await page.$eval(hatch, el => {
      const w = el.contraption.world;
      return !el.shadowRoot.querySelector('.window').hidden && !w.get(1, 0, 1) && !w.get(2, 0, 1);
    }));
    check('the window has the size of the opening', await page.$eval(hatch, el => {
      const r = el.shadowRoot.querySelector('.window').getBoundingClientRect(), B = el.contraption.view.B;
      return Math.abs(r.width - 2 * B) < 1 && Math.abs(r.height - B) < 1;
    }));
    await page.locator(hatch + ' >> .hit').click();
    check('closes again', await until(page, s => document.querySelector(s).open === false, hatch));
    check('toggle events fired', (await events(page)).filter(e => e.type === 'toggle').length === 2);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nfeedback: chip, progress, spinner, toast, status (and core host ARIA, cancelable events, settle:false)');
  {
    const { page, errors } = await open(browser);
    await page.locator('#rs-chip').scrollIntoViewIfNeeded();
    const chip = await page.evaluate(() => new Promise(resolve => {
      const el = document.querySelector('rs-chip[dismissible]');
      const label = el.shadowRoot.querySelector('.label').getAttribute('aria-hidden');
      el.addEventListener('dismiss', ev => {
        ev.preventDefault();
        setTimeout(() => resolve({ cancelable: ev.cancelable, connected: el.isConnected, label }), 50);
      });
      el.shadowRoot.querySelector('.hit').focus();
      el.shadowRoot.querySelector('.hit').click();
    }));
    check('chip: dismiss is cancelable; cancelled, the element stays; its text is not aria-hidden', chip.cancelable && chip.connected && chip.label === null, chip);
    const gone = await page.evaluate(() => new Promise(resolve => {
      const el = document.querySelectorAll('rs-chip[dismissible]')[1];
      el.shadowRoot.querySelector('.hit').click();
      setTimeout(() => resolve(el.isConnected), 600);
    }));
    check('chip: an uncancelled dismiss removes the element', gone === false);
    const bar = await page.evaluate(() => {
      const el = document.querySelector('rs-progress[value="40"]');
      el.value = 73;
      const a = [el.value, el._internals.role, el._internals.ariaValueNow];
      el.removeAttribute('value');
      return a.concat([el.value, el._internals.ariaBusy]);
    });
    check('progress: value snaps to the lamps, progressbar role, indeterminate when the value goes', bar.join() === '70,progressbar,70,,true', bar);
    const spin = await page.$eval('rs-spinner', el => [el._internals.role, el.contraption.world.quiet]);
    check('spinner: role status and its clock runs', spin[0] === 'status' && spin[1] === false, spin);
    await page.locator('#rs-toast').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById('saved').show());
    check('toast: show() opens it (toggle from the output)', await until(page, () => document.getElementById('saved').open === true));
    check('toast: the message window is shown', await page.$eval('#saved', el => !el.shadowRoot.querySelector('.window').hidden));
    check('toast: the timer closes it', await until(page, () => document.getElementById('saved').open === false, null, 6000));
    const st = await page.$eval('rs-status:not([on])', el => { el.on = true; return [el.on, el.hasAttribute('on')]; });
    check('status: setting on lights the lamp and reflects the attribute', st.join() === 'true,true', st);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-checkbox in a form (validity, reset, label, keyboard, set while the button is in)');
  {
    const { page, errors } = await open(browser);
    const terms = 'rs-checkbox[name="terms"]', news = 'rs-checkbox[name="news"]';
    await page.locator(terms).scrollIntoViewIfNeeded();
    check('required and unchecked: invalid, valueMissing', await page.$eval(terms, el => !el.checkValidity() && el.validity.valueMissing && !el.form.checkValidity()));
    check('starts with news checked in FormData', await page.$eval(news, el => new FormData(el.form).get('news') === 'on' && new FormData(el.form).get('terms') === null));
    const same = await page.$eval(terms, el => { el.shadowRoot.querySelector('.hit').click(); return el.checked; });
    check('a click does not change checked directly', same === false);
    check('checked follows the bulb', await until(page, s => document.querySelector(s).checked === true, terms));
    check('valid once checked; value submitted', await page.$eval(terms, el => el.checkValidity() && new FormData(el.form).get('terms') === 'yes'));
    check('role checkbox and aria-checked', await page.$eval(terms, el => { const b = el.shadowRoot.querySelector('.hit'); return b.getAttribute('role') === 'checkbox' && b.getAttribute('aria-checked') === 'true'; }));
    const ev = await events(page);
    check('one input and one change', ev.filter(e => e.name === 'terms' && e.type === 'change').length === 1 && ev.filter(e => e.name === 'terms' && e.type === 'input').length === 1, ev);
    // The button is still in (10 ticks): setting checked must still land, through a second press once it is out.
    check('el.checked = false right after a press still lands', await page.$eval(terms, el => { el.checked = false; return el.checked === false && !el.contraption.io.bulb.lit; }));
    await page.locator(news + ' >> .hit').focus();
    await page.keyboard.press('Space');
    check('keyboard Space presses the button', await until(page, s => document.querySelector(s).checked === false, news));
    await page.$eval(news, el => el.form.reset());
    check('form reset rebuilds from the starting attributes', await until(page, s => document.querySelector(s).checked === true, news));
    await page.$eval(terms, el => {
      const l = document.createElement('label');
      el.id = 'terms-box';
      l.htmlFor = 'terms-box';
      l.id = 'terms-label';
      l.textContent = 'Terms';
      el.form.appendChild(l);
    });
    await page.click('#terms-label');
    check('a <label for> click presses the button', await until(page, s => document.querySelector(s).checked === true, terms));
    check('disabled: a click does nothing', await page.$eval('rs-checkbox[name="beta"]', el => { el.click(); return el.shadowRoot.querySelector('.hit').disabled && !el.contraption.io.button.on; }));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-radio (latch bank, roving focus, caption clicks, form)');
  {
    const { page, errors } = await open(browser);
    const size = 'rs-radio[name="size"]', day = 'rs-radio[name="day"]';
    await page.locator(size).scrollIntoViewIfNeeded();
    check('starts at its value attribute; FormData has it', await page.$eval(size, el => el.value === 'm' && new FormData(el.form).get('size') === 'm'));
    check('required and unchosen: valueMissing', await page.$eval(day, el => el.value === '' && el.validity.valueMissing));
    check('one tab stop: the chosen option', await page.$eval(size, el => [...el.shadowRoot.querySelectorAll('.hit')].map(b => b.tabIndex).join() === '-1,0,-1,-1,-1,-1'));
    check('extra controls hidden; three radios named by option', await page.$eval(size, el => {
      const b = [...el.shadowRoot.querySelectorAll('.hit')].filter(x => !x.hidden);
      return b.length === 3 && b.every(x => x.getAttribute('role') === 'radio') && b[2].getAttribute('aria-label') === 'Large';
    }));
    const same = await page.$eval(size, el => { el.shadowRoot.querySelectorAll('.hit')[2].click(); return el.value; });
    check('a click does not change value directly', same === 'm');
    check('value follows the latches', await until(page, s => document.querySelector(s).value === 'l', size));
    let ev = await events(page);
    check('one input and one change', ev.filter(e => e.type === 'change' && e.name === 'size').length === 1 && ev.filter(e => e.type === 'input' && e.name === 'size').length === 1, ev);
    check('exactly one lamp lit, aria-checked on Large', await until(page, s => document.querySelector(s).contraption.io.lamps.filter(l => l.lit).length === 1, size) && await page.$eval(size, el => el.contraption.io.lamps.filter(l => l.lit).length === 1 && el.shadowRoot.querySelectorAll('.hit')[2].getAttribute('aria-checked') === 'true'));
    await page.locator(size + ' >> .hit >> nth=2').focus();
    await page.keyboard.press('ArrowDown');
    check('ArrowDown wraps to the first option, focuses and chooses it', await until(page, s => document.querySelector(s).value === 's', size) &&
      await page.$eval(size, el => el.shadowRoot.activeElement === el.shadowRoot.querySelectorAll('.hit')[0]));
    await page.keyboard.press('ArrowUp');
    check('ArrowUp wraps back to the last', await until(page, s => document.querySelector(s).value === 'l', size));
    await page.locator(size).getByText('Medium').click();
    check('clicking an option label chooses that option', await until(page, s => document.querySelector(s).value === 'm', size));
    // Two clicks a tick apart: the second wins.
    await page.$eval(day, el => { const b = el.shadowRoot.querySelectorAll('.hit'); b[0].click(); setTimeout(() => b[5].click(), 110); });
    check('a second click before the first settles wins', await until(page, s => document.querySelector(s).value === 'Sat', day));
    await page.waitForTimeout(800);
    check('and only its lamp is lit', await page.$eval(day, el => el.value === 'Sat' && el.contraption.io.lamps.filter(l => l.lit).length === 1));
    check('el.value = "Tue" settles at once', await page.$eval(day, el => { el.value = 'Tue'; return el.value === 'Tue' && el.contraption.io.lamps[1].lit; }));
    await page.$eval(day, el => el.form.reset());
    check('form reset returns both groups to their starting attributes', await until(page, s => { const [a, b] = document.querySelectorAll(s); return a.value === 'm' && b.value === ''; }, 'rs-radio'));
    await page.$eval(size, el => el.setAttribute('disabled', ''));
    await page.$eval(size, el => el.shadowRoot.querySelectorAll('.hit')[0].click());
    await page.waitForTimeout(700);
    check('disabled: no presses', await page.$eval(size, el => el.value === 'm' && !el.contraption.io.buttons.some(b => b.on)));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-slider (keyboard, pointer drag, form, reduced motion)');
  {
    const { page, errors } = await open(browser);
    const vol = 'rs-slider[name="volume"]', zoom = 'rs-slider[name="zoom"]';
    await page.locator(vol).scrollIntoViewIfNeeded();
    check('starts at its value; FormData has every enabled slider', await page.$eval(vol, el => el.value === '7' && el.contraption.io.comparator.out === 7 &&
      [...new FormData(el.form)].map(([k, v]) => k + '=' + v).join('&') === 'volume=7&zoom=30'));
    check('role slider with aria-valuenow/min/max/text', await page.$eval(zoom, el => {
      const b = el.shadowRoot.querySelector('.hit');
      return ['role', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext', 'aria-label'].map(a => b.getAttribute(a)).join() === 'slider,30,0,100,30,Zoom';
    }));
    await page.locator(vol + ' >> .hit').focus();
    await events(page);
    await page.keyboard.press('ArrowRight');
    check('ArrowRight puts books in until the comparator reads 8', await until(page, s => document.querySelector(s).value === '8', vol) &&
      await page.$eval(vol, el => el.contraption.io.lamps.filter(l => l.lit).length === 8));
    let ev = await events(page);
    check('one input and one change, carrying the new value', ev.filter(e => e.name === 'volume').map(e => e.type + e.value).join() === 'input8,change8', ev);
    for (const [k, v] of [['End', '15'], ['PageDown', '12'], ['Home', '0'], ['ArrowLeft', '0'], ['ArrowUp', '1']]) {
      await page.keyboard.press(k);
      check(`${k} -> ${v}`, await until(page, ([s, want]) => document.querySelector(s).value === want, [vol, v]));
    }
    check('state is announced', await page.$eval(vol, el => /Volume 1/.test(el.shadowRoot.querySelector('[aria-live]').textContent)));
    // Pointer: press on the 4th lamp and drag to the 10th; input while moving, one change on release.
    await events(page);
    const pts = await page.$eval(vol, el => {
      const v = el.contraption.view, st = el.shadowRoot.querySelector('.stage').getBoundingClientRect();
      return [3, 9].map(i => { const r = v.rectOf(el.contraption.io.lamps[i], 'front'); return [st.left + r.x + r.w / 2, st.top + r.y + r.h / 2]; });
    });
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    check('pressing on the 4th lamp aims for 4', await page.$eval(vol, el => el.value === '4' && el.committed === '1'));
    await page.mouse.move(pts[1][0], pts[1][1], { steps: 4 });
    check('dragging keeps aiming: 10, change not yet', await page.$eval(vol, el => el.value === '10'));
    ev = await events(page);
    const inputs = ev.filter(e => e.type === 'input' && e.name === 'volume').length;
    check('input fired while moving, no change yet', inputs >= 2 && !ev.some(e => e.type === 'change'), ev);
    await page.mouse.up();
    ev = await events(page);
    check('one change on release, with 10', ev.filter(e => e.type === 'change').map(e => e.value).join() === '10', ev);
    check('raw clicks never reach the page', !ev.some(e => e.type === 'click'), ev);
    check('el.value = 3 settles at once, no events', await page.$eval(vol, el => { el.value = 3; return el.value === '3' && el.contraption.io.comparator.out === 3; }));
    check('step 10 over 0..100: value snaps to the step', await page.$eval(zoom, el => { el.value = 47; return el.value === '50' && el.valueAsNumber === 50; }));
    await page.waitForTimeout(250);
    check('programmatic sets fire no events', !(await events(page)).some(e => e.name === 'volume' || e.name === 'zoom'));
    await page.$eval(vol, el => el.form.reset());
    check('form reset returns to the starting value', await until(page, s => document.querySelector(s).value === '7', vol));
    check('disabled: keys and pointer do nothing', await page.$eval('rs-slider[name="bass"]', el => {
      const b = el.shadowRoot.querySelector('.hit');
      b.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      return b.disabled && el.value === '2';
    }));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }
  {
    const { page, errors } = await open(browser, { reducedMotion: 'reduce' });
    const vol = 'rs-slider[name="volume"]';
    await page.locator(vol).scrollIntoViewIfNeeded();
    await page.locator(vol + ' >> .hit').focus();
    await page.keyboard.press('End');
    check('reduced motion: End settles at once and the state follows the comparator', await page.$eval(vol, el => el.value === '15' && el.contraption.world.quiet));
    check('reduced motion: no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-select (lectern, copper bulb curtain, combobox keys, form)');
  {
    const { page, errors } = await open(browser);
    const size = 'rs-select[name="size"]', ore = 'rs-select[name="ore"]';
    const hit = s => s + ' >> .hit';
    await page.locator(size).scrollIntoViewIfNeeded();
    check('starts at the selected option; FormData has both', await page.$eval(size, el => el.value === 'm' && el.contraption.io.lectern.page === 1 &&
      [...new FormData(el.form)].map(([k, v]) => k + '=' + v).join('&') === 'size=m&ore='));
    check('required with the empty placeholder: valueMissing', await page.$eval(ore, el => el.validity.valueMissing && !el.form.checkValidity()));
    check('combobox: name, aria-expanded=false, haspopup listbox, value text', await page.$eval(size, el => {
      const b = el.shadowRoot.querySelector('.hit');
      return b.getAttribute('role') === 'combobox' && b.getAttribute('aria-label') === 'Size' && b.getAttribute('aria-expanded') === 'false' &&
        b.getAttribute('aria-haspopup') === 'listbox' && b.textContent === 'Medium' && el.shadowRoot.querySelector('.window').getAttribute('role') === 'listbox';
    }));
    check('the chosen text sits beside the machine', await page.$eval(size, el => el.shadowRoot.querySelector('.rs-chosen').textContent === 'Medium'));
    const h0 = await page.$eval(size, el => el.getBoundingClientRect().height);
    await page.locator(hit(size)).focus();
    await page.keyboard.press('ArrowDown');
    check('ArrowDown presses the button; the list is open once the curtain is clear', await until(page, s => document.querySelector(s).open === true, size) &&
      await page.$eval(size, el => el.shadowRoot.querySelector('.hit').getAttribute('aria-expanded') === 'true' && !el.shadowRoot.querySelector('.window').hidden));
    check('the open list lies over the page: the element keeps its height', Math.abs(await page.$eval(size, el => el.getBoundingClientRect().height) - h0) < 1);
    check('the active option is the chosen one', await page.$eval(size, el => el.shadowRoot.querySelector('.hit').ariaActiveDescendantElement === el.children[1]));
    await events(page);
    await page.keyboard.press('ArrowDown');
    check('ArrowDown moves the active option without a player action', await page.$eval(size, el => el.shadowRoot.querySelector('.hit').ariaActiveDescendantElement === el.children[2] && el.value === 'm'));
    // A player waits for the menu button to come out (10 ticks): a page turn while it is in has its pulse lost.
    await until(page, s => !document.querySelector(s).contraption.io.button.on, size);
    await page.keyboard.press('Enter');
    check('Enter turns the page: value follows the comparator', await until(page, s => document.querySelector(s).value === 'l', size));
    check('and the pulse closes the list', await until(page, s => document.querySelector(s).open === false && !document.querySelector(s).hasAttribute('data-deployed'), size));
    let ev = await events(page);
    check('one input and one change', ev.filter(e => e.name === 'size').map(e => e.type + e.value).join() === 'inputl,changel', ev);
    check('aria-selected on the options', await page.$eval(size, el => [...el.children].map(o => o.getAttribute('aria-selected')).join() === 'false,false,true'));
    await page.keyboard.press('s');
    check('typing opens the list on the matching option', await until(page, s => document.querySelector(s).open === true, size) &&
      await page.$eval(size, el => el.shadowRoot.querySelector('.hit').ariaActiveDescendantElement === el.children[0]));
    await until(page, s => !document.querySelector(s).contraption.io.button.on, size);
    await page.keyboard.press('Escape');
    check('Escape closes it unchosen', await until(page, s => document.querySelector(s).open === false, size) && await page.$eval(size, el => el.value === 'l'));
    // Mouse: the combobox, then an option in the list.
    await page.locator(hit(ore)).click();
    check('a click opens the list', await until(page, s => document.querySelector(s).open === true, ore));
    check('a press while the button is still in does nothing: the list stays open', await page.$eval(ore, el => {
      if (!el.contraption.io.button.on) return true;     // too slow to catch it in: nothing to check
      el.shadowRoot.querySelector('.hit').click();
      return el.contraption.io.bulb.lit;
    }));
    await until(page, s => !document.querySelector(s).contraption.io.button.on, ore);
    await page.locator(ore + ' option:nth-of-type(4)').click();
    check('clicking an option chooses it', await until(page, s => document.querySelector(s).value === 'Copper' && !document.querySelector(s).open, ore));
    check('valid once chosen; FormData has it', await page.$eval(ore, el => el.checkValidity() && new FormData(el.form).get('ore') === 'Copper'));
    check('state is announced', await page.$eval(ore, el => /Copper selected/.test(el.shadowRoot.querySelector('[aria-live]').textContent)));
    check('el.value = "Gold" settles at once, closed', await page.$eval(ore, el => { el.value = 'Gold'; return el.value === 'Gold' && !el.open && !el.contraption.io.bulb.lit; }));
    await page.$eval(ore, el => el.form.reset());
    check('form reset returns to the starting choice', await until(page, s => { const [a, b] = document.querySelectorAll(s); return a.value === 'm' && b.value === ''; }, 'rs-select'));
    await page.$eval(size, el => el.setAttribute('disabled', ''));
    await page.$eval(size, el => el.shadowRoot.querySelector('.hit').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await page.waitForTimeout(500);
    check('disabled: no presses', await page.$eval(size, el => !el.open && !el.contraption.io.button.on && !el.contraption.io.bulb.lit));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-input (signs, native field, form, a page MutationObserver)');
  {
    const { page, errors } = await open(browser);
    const user = 'rs-input[name="user"]', note = 'rs-input[name="note"]';
    await page.locator(user).scrollIntoViewIfNeeded();
    check('starts from the value attribute, written on the signs; FormData has both', await page.$eval(note, el => el.value === 'Hello' && el.contraption.io.signs[0].text === 'Hello' &&
      [...new FormData(el.form)].map(([k, v]) => k + '=' + v).join('&') === 'user=&note=Hello'));
    check('required and blank: valueMissing; the placeholder shows on the signs', await page.$eval(user, el => el.validity.valueMissing &&
      el.shadowRoot.querySelector('.rs-text').textContent === 'Steve'));
    check('the native field: named by the label, maxlength = the signs, autocomplete passed on', await page.$eval(user, el => {
      const f = el.shadowRoot.querySelector('.rs-field');
      return f.getAttribute('aria-label') === 'Name' && f.maxLength === el.contraption.built.capacity && f.getAttribute('autocomplete') === 'username';
    }));
    await page.locator(user).getByText('Name').click();
    check('clicking the label focuses the field', await page.$eval(user, el => el.shadowRoot.activeElement === el.shadowRoot.querySelector('.rs-field')));
    await events(page);
    await page.keyboard.type('Alex');
    check('typing writes the signs, and value follows them at once', await page.$eval(user, el => el.value === 'Alex' && el.contraption.io.signs[0].text === 'Alex'));
    let ev = await events(page);
    check('one input per keystroke from the signs, no change yet', ev.filter(e => e.name === 'user').map(e => e.type + e.value).join() === 'inputA,inputAl,inputAle,inputAlex', ev);
    await page.keyboard.press('Tab');
    ev = await events(page);
    check('leaving the field commits: one change', ev.filter(e => e.name === 'user' && e.type === 'change').map(e => e.value).join() === 'Alex', ev);
    check('valid once filled; FormData has it', await page.$eval(user, el => el.checkValidity() && new FormData(el.form).get('user') === 'Alex'));
    await page.locator(note + ' >> .rs-field').focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' world, this is longer than thirty');
    check('maxlength 30 holds; a sign takes 15 characters', await page.$eval(note, el => el.value.length === 30 && el.contraption.io.signs[0].text.length === 15 && el.contraption.io.signs[1].text === el.value.slice(15)));
    await page.keyboard.press('Enter');
    ev = await events(page);
    check('Enter commits (change) and submits the form', ev.some(e => e.type === 'change' && e.name === 'note') && ev.some(e => e.type === 'submit'), ev);
    check('el.value = "Steve" writes the signs at once, no events', await page.$eval(user, el => { el.value = 'Steve'; return el.value === 'Steve' && el.contraption.io.signs[0].text === 'Steve' && el.shadowRoot.querySelector('.rs-field').value === 'Steve'; }));
    await page.waitForTimeout(200);
    check('a programmatic set fires no events', !(await events(page)).some(e => e.name === 'user'));
    await page.$eval(user, el => el.form.reset());
    check('form reset returns both fields to their starting values', await until(page, s => { const [a, b] = document.querySelectorAll(s); return a.value === '' && b.value === 'Hello'; }, 'rs-input'));
    await page.$eval(user, el => el.setAttribute('disabled', ''));
    await page.locator(user + ' >> .rs-field').focus().catch(() => {});
    await page.keyboard.type('zz');
    check('disabled: typing writes nothing', await page.$eval(user, el => el.value === '' && !el.contraption.io.signs[0].text));
    // Regression: a page MutationObserver with an element whose signs show fallback text must not loop.
    const alive = await Promise.race([
      page.evaluate(() => {
        new MutationObserver(() => {}).observe(document.body, { attributes: true, childList: true, subtree: true });
        const c = document.createElement('rs-collapse');
        c.setAttribute('summary', 'Loop?');
        document.body.appendChild(c);
        return new Promise(r => setTimeout(() => r(true), 300));
      }),
      new Promise(r => setTimeout(() => r(false), 4000)),
    ]);
    check('a MutationObserver on the page does not make sign labels loop', alive === true);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\ncore: clicks on content shown through an opening');
  {
    const { page, errors } = await open(browser);
    await page.evaluate(() => {
      const c = document.createElement('rs-collapse');
      c.id = 'click-through';
      c.setAttribute('summary', 'Clicks');
      c.setAttribute('open', '');
      c.innerHTML = '<button type="button" id="inside-opening">Inside</button>';
      document.body.prepend(c);
    });
    await page.locator('#inside-opening').scrollIntoViewIfNeeded();
    await until(page, () => document.querySelector('#click-through').open === true);
    await events(page);
    await page.locator('#inside-opening').click();
    const ev = await events(page);
    check('a click on slotted content inside an opening reaches page listeners like a normal DOM click', ev.some(e => e.type === 'click' && e.tag === 'button' && e.name === 'Inside'), ev);
    await page.$eval('#click-through', el => el.shadowRoot.querySelector('.hit').click());
    await page.waitForTimeout(150);
    check('a click on the machine itself still stays inside the element', !(await events(page)).some(e => e.type === 'click' && e.tag !== 'button'));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-theme (docs header, gallery, storage, workbench)');
  {
    const { page, errors } = await open(browser, { colorScheme: 'dark' });
    check('starts from prefers-color-scheme: dark', await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.querySelector('#lights').theme === 'dark'));
    const g = '#rs-theme rs-theme';
    await page.locator(g).scrollIntoViewIfNeeded();
    await page.locator(g + ' >> .hit').click();
    check('the gallery switch lights its lamp and the page turns light', await until(page, () => document.documentElement.dataset.theme === 'light'));
    check('stored, and the header switch follows through its own lever', await page.evaluate(() => localStorage.getItem('rs-theme') === 'light' && document.querySelector('#lights').contraption.io.lever.on === true));
    await page.reload();
    check('a reload starts from the stored choice', await page.evaluate(() => document.documentElement.dataset.theme === 'light' && document.querySelector('#lights').theme === 'light'));
    // Auto: a daylight detector; the sky follows the system colour scheme as it changes.
    await page.evaluate(() => { const t = document.createElement('rs-theme'); t.setAttribute('auto', ''); t.id = 'auto-theme'; t.textContent = 'Daylight'; document.body.appendChild(t); });
    check('auto: starts from the system scheme (dark) and has no control', await page.evaluate(() => { const t = document.querySelector('#auto-theme'); return t.theme === 'dark' && t.contraption.io.detector && t.shadowRoot.querySelector('.hit').hidden; }));
    await page.emulateMedia({ colorScheme: 'light' });
    check('auto: follows the system scheme as it changes', await until(page, () => document.querySelector('#auto-theme').theme === 'light' && document.documentElement.dataset.theme === 'light'));
    check('no console errors', errors.length === 0, errors);
    await page.close();
    const wb = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const wbErrors = [];
    wb.on('pageerror', e => wbErrors.push(String(e)));
    wb.on('console', m => { if (m.type() === 'error') wbErrors.push(m.text()); });
    await wb.goto(URL.replace('index.html', 'catalogue.html'));
    const t0 = await wb.evaluate(() => document.documentElement.dataset.theme);
    await wb.locator('#theme >> .hit').click();
    check('workbench: its rs-theme switches the page', await until(wb, t => document.documentElement.dataset.theme !== t, t0));
    check('workbench: no console errors', wbErrors.length === 0, wbErrors);
    await wb.close();
  }

  console.log('\nrs-modal: trigger, focus trap and return, Escape, backdrop, data-rs-close, reduced motion');
  {
    const { page, errors } = await open(browser);
    const dlg = '#hello', trigger = 'button[data-rs-open="hello"]';
    await page.evaluate(() => document.getElementById('hello').addEventListener('close', () => window.__events.push({ type: 'close', tag: 'rs-modal' })));
    await page.locator(trigger).scrollIntoViewIfNeeded();
    check('modal: starts closed, hidden, role dialog and aria-modal', await page.$eval(dlg, el => !el.open && getComputedStyle(el).visibility === 'hidden' && el._internals.role === 'dialog' && el._internals.ariaModal === 'true'));
    check('modal: the trigger gets aria-haspopup', await page.$eval(trigger, b => b.getAttribute('aria-haspopup') === 'dialog'));
    // Keyboard: Enter on the trigger.
    await page.locator(trigger).focus();
    const same = await page.$eval(trigger, b => { b.click(); return document.getElementById('hello').open; });
    check('modal: a trigger click does not set open directly', same === false);
    check('modal: open follows the door', await until(page, s => document.querySelector(s).open === true, dlg));
    let ev = await events(page);
    check('modal: one toggle event, after the door cleared', ev.filter(e => e.type === 'toggle' && e.tag === 'rs-modal').length === 1, ev);
    check('modal: focus moved into the content', await page.$eval(dlg, el => el.contains(document.activeElement) && document.activeElement !== el));
    check('modal: the page behind is inert', await page.$eval(trigger, b => !!b.closest('[inert]')));
    const trapped = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      trapped.push(await page.$eval(dlg, el => el === document.activeElement || el.contains(document.activeElement)));
    }
    check('modal: Tab and Shift+Tab stay inside', trapped.every(Boolean), trapped);
    await page.keyboard.press('Escape');
    check('modal: Escape presses the close button; close fires when the door is home', await until(page, () => window.__events.some(e => e.type === 'close')));
    check('modal: the overlay goes once the latch is reset', await until(page, s => !document.querySelector(s).hasAttribute('data-deployed'), dlg));
    check('modal: focus returns to the trigger and the page is live again', await page.$eval(trigger, b => document.activeElement === b && !b.closest('[inert]')));
    // Mouse: the trigger, then a click on the backdrop.
    await page.locator(trigger).click();
    await until(page, s => document.querySelector(s).open === true, dlg);
    await page.mouse.click(4, 4);
    check('modal: a backdrop click closes it', await until(page, s => document.querySelector(s).open === false, dlg));
    await until(page, s => !document.querySelector(s).hasAttribute('data-deployed'), dlg);
    // An <rs-button> trigger opens it when its lamp lights; data-rs-close inside the content closes it.
    await page.locator('rs-button[data-rs-open="hello"] >> .hit').click();
    check('modal: an rs-button trigger opens it', await until(page, s => document.querySelector(s).open === true, dlg));
    await page.locator(dlg + ' [data-rs-close]').click();
    check('modal: data-rs-close closes it', await until(page, s => document.querySelector(s).open === false, dlg));
    await until(page, s => !document.querySelector(s).hasAttribute('data-deployed'), dlg);
    check('modal: the close control is named', await page.$eval(dlg, el => el.shadowRoot.querySelector('.hit').getAttribute('aria-label') === 'Close'));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }
  {
    const { page, errors } = await open(browser, { reducedMotion: 'reduce' });
    const r = await page.$eval('#hello', el => { el.showModal(); const a = el.open; el.close(); return [a, el.open, el.hasAttribute('data-deployed')]; });
    check('modal, reduced motion: showModal() and close() settle at once', r.join() === 'true,false,false', r);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-tooltip and rs-popover');
  {
    const { page, errors } = await open(browser);
    const tip = 'rs-tooltip[for="tip-save"]', save = '#tip-save';
    await page.locator(save).scrollIntoViewIfNeeded();
    check('tooltip: role tooltip, the target is described by it', await page.$eval(tip, el => el._internals.role === 'tooltip' && document.getElementById('tip-save').getAttribute('aria-describedby') === el.id));
    await page.locator(save).hover();
    check('tooltip: pointing at the target uncovers the signs', await until(page, s => document.querySelector(s).open === true, tip));
    check('tooltip: the tip sits next to its target, on screen', await page.$eval(tip, el => {
      const b = el.shadowRoot.querySelector('.box').getBoundingClientRect(), t = document.getElementById('tip-save').getBoundingClientRect();
      return (b.bottom <= t.top + 1 || b.top >= t.bottom - 1) && b.left >= 0 && b.right <= innerWidth && getComputedStyle(el.shadowRoot.querySelector('.label')).visibility === 'visible';
    }));
    let ev = await events(page);
    check('tooltip: toggle fired once', ev.filter(e => e.type === 'toggle' && e.tag === 'rs-tooltip').length === 1, ev);
    await page.mouse.move(2, 600);
    check('tooltip: leaving covers it again after the plate releases', await until(page, s => document.querySelector(s).open === false && !document.querySelector(s).hasAttribute('data-deployed'), tip));
    await page.locator(save).focus();
    check('tooltip: focus shows it', await until(page, s => document.querySelector(s).open === true, tip));
    await page.keyboard.press('Escape');
    check('tooltip: Escape dismisses it while focus stays', await until(page, s => document.querySelector(s).open === false, tip) && await page.evaluate(() => document.activeElement.id === 'tip-save'));
    const wrap = 'rs-tooltip[tip]';
    await page.locator(wrap + ' button').hover();
    check('tooltip: wrapping its target works, with aria-description', await until(page, s => document.querySelector(s).open === true, wrap) && await page.$eval(wrap + ' button', b => b.getAttribute('aria-description') === 'Ctrl+Z'));
    await page.mouse.move(2, 600);

    const pop = 'rs-popover', ptrig = '#rs-popover .live > button';
    await page.locator(ptrig).scrollIntoViewIfNeeded();
    await events(page);
    check('popover: trigger has aria-expanded false and aria-controls', await page.$eval(ptrig, b => b.getAttribute('aria-expanded') === 'false' && b.getAttribute('aria-controls') === document.querySelector('rs-popover').id));
    await page.locator(ptrig).click();
    check('popover: a click opens it (open follows the door)', await until(page, s => document.querySelector(s).open === true, pop));
    check('popover: aria-expanded follows', await page.$eval(ptrig, b => b.getAttribute('aria-expanded') === 'true'));
    await page.locator(ptrig).click();
    check('popover: clicking the trigger again closes it', await until(page, s => document.querySelector(s).open === false, pop));
    await until(page, s => !document.querySelector(s).hasAttribute('data-deployed'), pop);
    await page.locator(ptrig).focus();
    await page.keyboard.press('Enter');
    check('popover: keyboard opens it', await until(page, s => document.querySelector(s).open === true, pop));
    await page.keyboard.press('Tab');
    check('popover: Tab from the trigger reaches the close control', await page.evaluate(() => document.activeElement.localName === 'rs-popover'));
    await page.keyboard.press('Escape');
    check('popover: Escape closes it and focus returns to the trigger', await until(page, s => document.querySelector(s).open === false, pop) && await page.evaluate(s => document.activeElement === document.querySelector(s), ptrig));
    await until(page, s => !document.querySelector(s).hasAttribute('data-deployed'), pop);
    await page.locator(ptrig).click();
    await until(page, s => document.querySelector(s).open === true, pop);
    await page.mouse.click(1200, 20);
    check('popover: a click outside closes it', await until(page, s => document.querySelector(s).open === false, pop));
    ev = await events(page);
    check('popover: toggle events come from the door', ev.filter(e => e.type === 'toggle' && e.tag === 'rs-popover').length === 6, ev);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-dropdown');
  {
    const { page, errors } = await open(browser);
    const dd = 'rs-dropdown';
    await page.evaluate(() => document.querySelector('rs-dropdown').addEventListener('select', ev => window.__events.push({ type: 'select', value: ev.detail.value })));
    await page.locator(dd).scrollIntoViewIfNeeded();
    check('dropdown: menu button with aria-haspopup and aria-expanded false; items are menuitems in a menu', await page.$eval(dd, el => {
      const hit = el.shadowRoot.querySelector('.hit');
      return hit.getAttribute('aria-haspopup') === 'menu' && hit.getAttribute('aria-expanded') === 'false' &&
        el.shadowRoot.querySelector('.window').getAttribute('role') === 'menu' && [...el.children].every(n => n.getAttribute('role') === 'menuitem');
    }));
    await page.locator(dd + ' >> .hit').click();
    check('dropdown: a click opens it when the door is clear; focus on the first item', await until(page, s => document.querySelector(s).open === true, dd) &&
      await page.evaluate(() => document.activeElement.textContent === 'Copy'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    check('dropdown: arrow keys wrap round the items', await page.evaluate(() => document.activeElement.textContent === 'Copy'));
    await page.keyboard.press('d');
    check('dropdown: typeahead', await page.evaluate(() => document.activeElement.textContent === 'Delete'));
    await page.waitForTimeout(1100);   // the button is in for 10 ticks after the press
    await page.keyboard.press('Enter');
    check('dropdown: choosing an item presses the button; select fires with it once the door has shut', await until(page, () => window.__events.some(e => e.type === 'select')) &&
      await page.$eval(dd, el => el.open === false) && (await events(page)).find(e => e.type === 'select').value === 'delete');
    check('dropdown: focus returns to the menu button', await page.evaluate(() => document.activeElement.localName === 'rs-dropdown'));
    await page.waitForTimeout(1100);
    await page.keyboard.press('ArrowDown');
    check('dropdown: ArrowDown on the button opens it', await until(page, s => document.querySelector(s).open === true, dd));
    await page.waitForTimeout(1100);
    await page.keyboard.press('Escape');
    check('dropdown: Escape shuts it, no select', await until(page, s => document.querySelector(s).open === false, dd) && !(await events(page)).some(e => e.type === 'select'));
    await page.waitForTimeout(1100);
    await page.locator(dd + ' >> .hit').click();
    await until(page, s => document.querySelector(s).open === true, dd);
    await page.waitForTimeout(1100);
    await page.mouse.click(1200, 20);
    check('dropdown: a click outside shuts it', await until(page, s => document.querySelector(s).open === false && !document.querySelector(s).hasAttribute('data-deployed'), dd));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\ndisplay: divider, list, card, counter');
  {
    const { page, errors } = await open(browser);
    await page.locator('#rs-divider').scrollIntoViewIfNeeded();
    check('divider: role separator, as wide as its container, plain one is quiet', await page.$eval('rs-divider:not([pulse])', el => {
      const box = el.shadowRoot.querySelector('.box').getBoundingClientRect().width, w = el.getBoundingClientRect().width;
      return el._internals.role === 'separator' && w - box < el.contraption.view.B && box > 0 && el.contraption.world.quiet;
    }));
    check('divider: pulse runs its clock', await until(page, () => document.querySelector('rs-divider[pulse]').contraption.io.repeaters.some(r => r.on)));
    await page.locator('#rs-list').scrollIntoViewIfNeeded();
    check('list: one lit torch per item, beside its first line', await page.$eval('#rs-list rs-list:not([ordered])', el => {
      const items = [...el.querySelectorAll('li')], c = el.contraption, B = c.view.B;
      const top = el.shadowRoot.querySelector('.box').getBoundingClientRect().top;
      return c.built.bullets.length === items.length && c.built.bullets.every(([t], k) => {
        const r = c.view.rectOf(t, 'front'), li = items[k].getBoundingClientRect();
        const mid = top + r.y + r.h / 2, line = parseFloat(getComputedStyle(items[k]).lineHeight);
        return t.lit && mid > li.top - 2 && mid < li.top + line + 2;
      });
    }));
    check('list: the column reflows when the items rewrap', await page.$eval('#rs-list rs-list:not([ordered])', async el => {
      const h0 = el.contraption.built.height;
      el.style.width = '200px';
      await new Promise(r => setTimeout(r, 400));
      const h1 = el.contraption.built.height;
      el.style.width = '';
      return h1 > h0;
    }));
    await events(page);
    await page.locator('#rs-list rs-list a').first().click();
    check('list: a click on a link in an item reaches the page', (await events(page)).some(e => e.type === 'click' && e.tag === 'a'));
    check('card: the content shows through a clear opening; the on attribute lights the corner lamp', await page.$eval('rs-card[heading="Vault"]', el => {
      const shown = !el.shadowRoot.querySelector('.window').hidden;
      el.setAttribute('on', '');
      return shown && el.on === true && el.contraption.io.lamp.lit && el.contraption.view.B >= 30;
    }));
    check('counter: setting value moves items and the readout follows the comparators', await page.$eval('#online', el => {
      el.value = 63;
      const rows = el.contraption.built.rows.map(r => r.lamps.filter(l => l.lit).length).join();
      return el.value === 63 && rows === '6,3' && el.shadowRoot.querySelector('.readout').textContent === '63';
    }));
    const idle = await page.evaluate(async () => {
      const host = document.createElement('div');
      host.innerHTML = '<rs-divider></rs-divider><rs-list><li>a</li><li>b</li></rs-list>'.repeat(20);
      document.querySelector('#rs-list .live').appendChild(host);
      await new Promise(r => setTimeout(r, 600));
      const els = [...host.children];
      const canvases = els.map(e => e.shadowRoot.querySelector('canvas'));
      await new Promise(r => setTimeout(r, 600));
      const still = els.every((e, i) => e.contraption.world.quiet && e.shadowRoot.querySelector('canvas') === canvases[i]);
      host.remove();
      return still;
    });
    check('twenty dividers and twenty lists are quiet and never rebuilt while idle', idle);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-drawer');
  {
    const { page, errors } = await open(browser);
    const d = '#site-drawer';
    const trigger = page.locator('[data-rs-open="site-drawer"]');
    const h0 = await page.$eval(d, e => e.contraption.world.hash());
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await page.keyboard.press('Enter');
    check('the trigger puts the overlay up; open waits for the machine', await until(page, s => { const e = document.querySelector(s); return e.deployed && !e.open; }, d, 1000));
    check('open when the machine parks; focus moves into the panel', await until(page, s => { const e = document.querySelector(s); return e.open && e.contains(document.activeElement); }, d, 6000));
    check('the page behind is inert', await page.evaluate(() => document.querySelector('main, .page, body > div') ? [...document.body.children].some(n => n.inert) : true));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    check('Tab stays inside the drawer', await page.$eval(d, e => e.contains(document.activeElement) || document.activeElement === e));
    await page.keyboard.press('Escape');
    check('Escape flies it home: close fires, focus returns to the trigger', await until(page, s => {
      const e = document.querySelector(s);
      return !e.deployed && !e.open && document.activeElement && document.activeElement.getAttribute('data-rs-open') === 'site-drawer';
    }, d, 6000));
    check('a full cycle returns the world to its start', await until(page, ([s, h]) => { const w = document.querySelector(s).contraption.world; return w.quiet && w.hash() === h; }, [d, h0], 3000));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }
  {
    const { page, errors } = await open(browser, { reducedMotion: 'reduce' });
    check('drawer, reduced motion: show() parks it at once', await page.$eval('#site-drawer', e => { e.show(); return e.open && e.contraption.state.lead === e.contraption.built.cols - 1; }));
    check('drawer, reduced motion: a backdrop click closes it at once', await page.$eval('#site-drawer', e => { e.click(); return !e.open && !e.deployed; }));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-tabs');
  {
    const { page, errors } = await open(browser);
    const tabs = 'rs-tabs';
    await page.evaluate(() => document.querySelector('rs-tabs').addEventListener('change', ev => window.__events.push({ type: 'tabs-change', value: ev.detail.value })));
    await page.locator(tabs).scrollIntoViewIfNeeded();
    const hits = tabs + ' >> .hit';
    check('tabs: starts on the panel marked selected; three tabs in a tablist, aria-selected on it', await page.$eval(tabs, el => {
      const b = [...el.shadowRoot.querySelectorAll('.hit')].filter(h => !h.hidden);
      return el.value === 'Reviews' && el.selected === 1 && b.length === 3 && b.every(h => h.getAttribute('role') === 'tab') &&
        b[1].getAttribute('aria-selected') === 'true' && b[0].getAttribute('aria-selected') === 'false' &&
        el.shadowRoot.querySelector('.controls').getAttribute('role') === 'tablist' && b[2].getAttribute('aria-label') === 'Ship';
    }));
    check('tabs: only the selected panel is rendered, as a named tabpanel', await page.$eval(tabs, el => {
      const p = [...el.children];
      return p[1].getBoundingClientRect().height > 0 && p[0].getBoundingClientRect().height === 0 && p[1].getAttribute('role') === 'tabpanel' && p[1].getAttribute('aria-label') === 'Reviews';
    }));
    const same = await page.$eval(tabs, el => { el.shadowRoot.querySelectorAll('.hit')[2].click(); return el.value; });
    check('tabs: a click does not change value directly', same === 'Reviews');
    check('tabs: the shutter closes before the panel changes', await until(page, s => !document.querySelector(s).contraption.state.shown1 && document.querySelector(s).value === 'Reviews', tabs));
    check('tabs: value follows the shutter clearing on the new panel', await until(page, s => document.querySelector(s).value === 'Ship', tabs));
    let ev = await events(page);
    check('tabs: one change event, with the new value', ev.filter(e => e.type === 'tabs-change').length === 1 && ev.find(e => e.type === 'tabs-change').value === 'Ship', ev);
    // Keyboard: arrows, Home and End move focus and choose as they go.
    await page.waitForTimeout(1100);
    await page.locator(hits).nth(2).focus();
    await page.keyboard.press('ArrowUp');
    check('tabs: ArrowUp chooses the previous tab', await until(page, s => document.querySelector(s).value === 'Reviews', tabs));
    await page.waitForTimeout(1100);
    await page.keyboard.press('Home');
    check('tabs: Home chooses the first tab and focus follows', await until(page, s => document.querySelector(s).value === 'Specs', tabs) &&
      await page.$eval(tabs, el => el.shadowRoot.activeElement === el.shadowRoot.querySelectorAll('.hit')[0]));
    await page.waitForTimeout(1100);
    await page.keyboard.press('End');
    check('tabs: End chooses the last tab', await until(page, s => document.querySelector(s).value === 'Ship', tabs));
    check('tabs: roving tab stop on the selected tab', await page.$eval(tabs, el => [...el.shadowRoot.querySelectorAll('.hit')].map(b => b.tabIndex).slice(0, 3).join() === '-1,-1,0'));
    check('tabs: el.value = "Specs" settles at once', await page.$eval(tabs, el => { el.value = 'Specs'; return el.value === 'Specs' && el.selected === 0 && el.contraption.state.shown0; }));
    await page.$eval(tabs, el => el.setAttribute('disabled', ''));
    await page.$eval(tabs, el => el.shadowRoot.querySelectorAll('.hit')[1].click());
    await page.waitForTimeout(900);
    check('tabs: disabled: no presses', await page.$eval(tabs, el => el.value === 'Specs' && !el.contraption.io.buttons.some(b => b.on)));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }
  {
    const { page, errors } = await open(browser, { reducedMotion: 'reduce' });
    await page.locator('rs-tabs').scrollIntoViewIfNeeded();
    const r = await page.$eval('rs-tabs', el => { el.shadowRoot.querySelectorAll('.hit')[0].click(); return el.value; });
    check('tabs, reduced motion: a click settles at once', r === 'Specs', r);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-accordion');
  {
    const { page, errors } = await open(browser);
    const acc = 'rs-accordion';
    await page.evaluate(() => {
      const el = document.querySelector('rs-accordion');
      el.addEventListener('change', ev => window.__events.push({ type: 'acc-change', value: ev.detail.value }));
      [...el.children].forEach((d, k) => d.addEventListener('toggle', () => window.__events.push({ type: 'details-toggle', k, open: d.open })));
    });
    await page.locator(acc).scrollIntoViewIfNeeded();
    const state = () => page.$eval(acc, el => ({ open: el.open, value: el.value, details: [...el.children].map(d => d.open).join() }));
    check('accordion: starts with the details marked open; headers have aria-expanded; a close-all control', await page.$eval(acc, el => {
      const b = [...el.shadowRoot.querySelectorAll('.hit')].filter(h => !h.hidden);
      return el.open === 1 && el.value === 'Returns' && b.length === 4 && b[1].getAttribute('aria-expanded') === 'true' && b[0].getAttribute('aria-expanded') === 'false' &&
        b[0].getAttribute('aria-label') === 'Shipping' && b[3].getAttribute('aria-label') === 'Close all';
    }));
    await page.locator(acc + ' >> .hit').nth(0).click();
    check('accordion: a header click opens its item when the opening clears, and closes the other', await until(page, s => document.querySelector(s).open === 0, acc));
    const s0 = await state();
    check('accordion: each details mirrors it', s0.details === 'true,false,false', s0);
    await page.waitForTimeout(300);
    let ev = await events(page);
    check('accordion: one change; native toggle on both details', ev.filter(e => e.type === 'acc-change').length === 1 && ev.filter(e => e.type === 'details-toggle').length === 2, ev);
    await page.waitForTimeout(1100);
    await page.locator(acc + ' >> .hit').nth(0).focus();
    await page.keyboard.press('Enter');
    check('accordion: Enter on the open header closes it (the none button)', await until(page, s => document.querySelector(s).open === -1, acc) &&
      await page.$eval(acc, el => el.contraption.io.none.on || el.contraption.state.value === ''));
    check('accordion: no body shown, every details closed', await page.$eval(acc, el => [...el.children].every(d => !d.open) && el.shadowRoot.querySelectorAll('.window:not([hidden])').length === 0));
    await page.waitForTimeout(1100);
    await page.$eval(acc, el => { el.children[2].open = true; });
    check('accordion: page code opening a details presses its button', await until(page, s => document.querySelector(s).open === 2, acc));
    check('accordion: el.value = "Shipping" settles at once', await page.$eval(acc, el => { el.value = 'Shipping'; return el.open === 0 && el.children[0].open && !el.children[2].open; }));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-steps');
  {
    const { page, errors } = await open(browser);
    const tl = 'rs-steps:not([manual])', man = 'rs-steps[manual]';
    await page.evaluate(() => document.querySelectorAll('rs-steps').forEach((el, i) => el.addEventListener('change', ev => window.__events.push({ type: 'steps-change', i, value: ev.detail.value }))));
    await page.locator(tl).scrollIntoViewIfNeeded();
    check('steps: a progressbar at 0 of 4; the lever is a switch', await page.$eval(tl, el => el._internals.role === 'progressbar' && el._internals.ariaValueNow === '0' && el._internals.ariaValueMax === '4' &&
      [...el.shadowRoot.querySelectorAll('.hit')].filter(b => !b.hidden).map(b => b.getAttribute('role')).join() === 'switch'));
    await page.locator(tl + ' >> .hit').first().focus();
    await page.keyboard.press('Space');
    check('steps: the lever runs the timeline to the last step', await until(page, s => document.querySelector(s).value === 4, tl));
    let ev = (await events(page)).filter(e => e.type === 'steps-change' && e.i === 0);
    check('steps: one change per lamp, in order', ev.map(e => e.value).join() === '1,2,3,4', ev);
    check('steps: aria-current="step" on the last step reached', await page.$eval(tl, el => el.children[3].getAttribute('aria-current') === 'step' && !el.children[2].hasAttribute('aria-current')));
    check('steps, manual: starts at step 1 with a next and a previous control', await page.$eval(man, el => el.value === 1 && el.children[0].getAttribute('aria-current') === 'step' &&
      [...el.shadowRoot.querySelectorAll('.hit')].filter(b => !b.hidden).map(b => b.getAttribute('aria-label')).join() === 'Next step,Previous step'));
    await page.locator(man + ' >> .hit').nth(1).click();
    check('steps, manual: next lights the next lamp', await until(page, s => document.querySelector(s).value === 2, man));
    await page.$eval(man, el => el.previous());
    check('steps, manual: previous() takes a book back', await until(page, s => document.querySelector(s).value === 1, man));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-pagination');
  {
    const { page, errors } = await open(browser);
    const pg = 'rs-pagination';
    await page.evaluate(() => document.querySelector('rs-pagination').addEventListener('change', ev => window.__events.push({ type: 'page-change', value: ev.detail.value })));
    await page.locator(pg).scrollIntoViewIfNeeded();
    check('pagination: a named navigation landmark on page 3 of 7, page 3 marked current', await page.$eval(pg, el => {
      const b = [...el.shadowRoot.querySelectorAll('.hit')].filter(h => !h.hidden);
      return el.page === 3 && el._internals.role === 'navigation' && b.length === 9 && b[4].getAttribute('aria-current') === 'page' && b[1].getAttribute('aria-label') === 'Next page';
    }));
    const same = await page.$eval(pg, el => { el.shadowRoot.querySelectorAll('.hit')[1].click(); return el.page; });
    check('pagination: a click does not change page directly', same === 3);
    check('pagination: page follows the comparator', await until(page, s => document.querySelector(s).page === 4, pg));
    await page.locator(pg + ' >> .hit').nth(1).focus();
    await page.keyboard.press('Home');
    check('pagination: Home turns to the first page', await until(page, s => document.querySelector(s).page === 1, pg));
    await page.locator(pg + ' >> .hit').nth(8).click();
    check('pagination: a page control turns straight to its page', await until(page, s => document.querySelector(s).page === 7, pg));
    const ev = (await events(page)).filter(e => e.type === 'page-change');
    check('pagination: one change per page shown', ev.map(e => e.value).join() === '4,1,7', ev);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nrs-breadcrumb');
  {
    const { page, errors } = await open(browser);
    const bc = 'rs-breadcrumb';
    await page.locator(bc).scrollIntoViewIfNeeded();
    check('breadcrumb: built with the signal walked out to the current page', await until(page, s => document.querySelector(s).arrived === true, bc));
    check('breadcrumb: a navigation landmark; the last crumb is aria-current="page"; links sit on the signs', await page.$eval(bc, el => {
      const a = el.children[0].getBoundingClientRect(), box = el.shadowRoot.querySelector('.box').getBoundingClientRect();
      return el._internals.role === 'navigation' && el.children[2].getAttribute('aria-current') === 'page' && a.height > 0 && a.top >= box.top && a.bottom <= box.bottom;
    }));
    await page.locator(bc + ' a').nth(1).click();
    check('breadcrumb: the links are ordinary links', await page.evaluate(() => location.hash === '#rs-tabs'));
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  console.log('\nnarrow and dark');
  {
    const { page, errors } = await open(browser, { viewport: { width: 320, height: 700 }, colorScheme: 'dark' });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    check('no horizontal scroll at 320 px', wide <= 320, wide);
    check('no console errors', errors.length === 0, errors);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
