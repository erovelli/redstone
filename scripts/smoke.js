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
