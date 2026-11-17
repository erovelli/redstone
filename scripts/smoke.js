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
        const rec = { type, tag: t.localName, name, checked: t.checked, active: t.active };
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
