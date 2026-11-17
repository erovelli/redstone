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
