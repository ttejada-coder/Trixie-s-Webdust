'use strict';
/* =====================================================
   Trixie's Webdust - script.js
   Sections: 1 Helpers | 2 Conversion | 3 Income Tax
             4 Looping | 5 Payroll | 6 (removed)
             7 Navigation | 8 Start-up (wires everything up)
   Every tool is split in two parts:
     - "logic" functions that only do math (easy to test)
     - "UI" functions that read inputs and update the page
   ===================================================== */

/* ---------- 1. HELPERS ---------- */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Turns the text a user typed into a number, or explains what is wrong.
// Commas are allowed (e.g. 320,000). Letters, empty text and "1e5" are rejected.
const parseNumber = (raw, label) => {
  const text = String(raw ?? '').trim().replace(/,/g, '');
  if (text === '') return { error: `${label} is required.` };
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return { error: `${label} must be a number, like 25 or 12.5.` };
  return { value: Number(text) };
};

const showError = (el, message) => { el.textContent = message; el.hidden = false; };
const clearError = (el) => { el.textContent = ''; el.hidden = true; };

/* ---------- 2. CONVERSION ---------- */
// One entry per converter. "min" is the smallest value that makes sense.
const CONVERTERS = {
  c2f:  { label: 'Temperature', from: '°C', to: '°F',  min: -273.15, minMessage: 'Temperature cannot be below absolute zero (-273.15 °C).', convert: (c) => (c * 9) / 5 + 32 },
  f2c:  { label: 'Temperature', from: '°F', to: '°C',  min: -459.67, minMessage: 'Temperature cannot be below absolute zero (-459.67 °F).', convert: (f) => ((f - 32) * 5) / 9 },
  m2ft: { label: 'Length',      from: 'm',  to: 'ft',  min: 0,       minMessage: 'Length cannot be negative.',                              convert: (m) => m / 0.3048 },
  ft2m: { label: 'Length',      from: 'ft', to: 'm',   min: 0,       minMessage: 'Length cannot be negative.',                              convert: (ft) => ft * 0.3048 },
};

// Logic: validate the text, then convert. Returns { value, result } or { error }.
const runConversion = (type, raw) => {
  const { label, min, minMessage, convert } = CONVERTERS[type];
  const { value, error } = parseNumber(raw, label);
  if (error) return { error };
  if (value < min) return { error: minMessage };
  return { value, result: round2(convert(value)) };
};

// UI: the pop-up. <dialog> gives us the Esc key for free.
const openResultModal = ({ input, answer }) => {
  const modal = $('#result-modal');
  $('#modal-input').textContent = input;
  $('#modal-answer').textContent = answer;
  modal.showModal();
  $('#modal-close').focus();
};

const setupModal = () => {
  const modal = $('#result-modal');
  $('#modal-close').addEventListener('click', () => modal.close());
  // Clicking the dark area outside the white box targets the <dialog> itself.
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
};

const handleConvert = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.converter;
  const { from, to } = CONVERTERS[type];
  const errorEl = $('.error', form);
  const output = $('output', form);

  const { value, result, error } = runConversion(type, form.elements.amount.value);
  if (error) {
    output.textContent = '';
    showError(errorEl, error);
    return;
  }
  clearError(errorEl);
  const input = `${decimal.format(value)} ${from}`;
  const answer = `${decimal.format(result)} ${to}`;
  output.textContent = `${input} = ${answer}`;
  openResultModal({ input, answer });
};

/* ---------- 3. INCOME TAX ---------- */
// Each bracket: tax = base + rate x (income - over)
const TAX_BRACKETS = [
  { over: 0,       base: 0,       rate: 0 },
  { over: 250000,  base: 0,       rate: 0.20 },
  { over: 400000,  base: 30000,   rate: 0.25 },
  { over: 800000,  base: 130000,  rate: 0.30 },
  { over: 2000000, base: 490000,  rate: 0.32 },
  { over: 8000000, base: 2410000, rate: 0.35 },
];

// Logic: find the highest bracket the income is "over", then apply its formula.
const computeTax = (income) => {
  const bracket = [...TAX_BRACKETS].reverse().find(({ over }) => income > over) ?? TAX_BRACKETS[0];
  const { over, base, rate } = bracket;
  return { tax: round2(base + (income - over) * rate), bracket };
};

const validateIncome = (raw) => {
  const { value, error } = parseNumber(raw, 'Taxable income');
  if (error) return { error };
  if (value < 0) return { error: 'Taxable income cannot be negative.' };
  if (value > 1e12) return { error: 'Taxable income is too large. Enter a value under 1,000,000,000,000.' };
  return { value };
};

const handleTax = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = $('.error', form);
  const resultEl = $('#tax-result');

  const { value, error } = validateIncome(form.elements.income.value);
  if (error) {
    resultEl.textContent = '';
    showError(errorEl, error);
    return;
  }
  clearError(errorEl);
  const { tax, bracket } = computeTax(value);

  resultEl.textContent = `Tax due: ${peso.format(tax)}`;
  const detail = document.createElement('small');
  detail.textContent = bracket.rate === 0
    ? `Income of ${peso.format(value)} is in the no-tax bracket.`
    : `Bracket: ${peso.format(bracket.base)} + ${Math.round(bracket.rate * 100)}% of the excess over ${peso.format(bracket.over)}.`;
  resultEl.append(detail);

  // Highlight the matching row in the bracket table
  $$('#tax-table tbody tr').forEach((row) => {
    const isActive = Number(row.dataset.over) === bracket.over;
    row.classList.toggle('active', isActive);
    if (isActive) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
  });
};

/* ---------- 4. LOOPING ---------- */
const MAX_N = 100; // keeps the factorial readable (100! has 158 digits)

// WHILE loop: factorial. BigInt keeps big answers exact.
const factorialWhile = (n) => {
  let result = 1n;
  let counter = BigInt(n);
  while (counter > 1n) {
    result *= counter;
    counter--;
  }
  return result;
};

// DO...WHILE loop: sum. Starting at 0 lets N = 0 work, since the body always runs once.
const sumDoWhile = (n) => {
  let sum = 0;
  let i = 0;
  do {
    sum += i;
    i++;
  } while (i <= n);
  return sum;
};

// FOR loop: average. Returns null when N = 0 (nothing to average).
const averageFor = (n) => {
  let total = 0;
  for (let i = 1; i <= n; i++) total += i;
  return n === 0 ? null : total / n;
};

const validateN = (raw) => {
  const { value, error } = parseNumber(raw, 'N');
  if (error) return { error };
  if (!Number.isInteger(value)) return { error: 'N must be a whole number (no decimals).' };
  if (value < 0) return { error: 'N cannot be negative.' };
  if (value > MAX_N) return { error: `N cannot be more than ${MAX_N}.` };
  return { value };
};

// Builds one result tile using textContent (no innerHTML).
const makeTile = (title, value, note) => {
  const tile = document.createElement('div');
  tile.className = 'tile';
  const heading = document.createElement('h4');
  const big = document.createElement('p');
  const small = document.createElement('small');
  big.className = 'big';
  heading.textContent = title;
  big.textContent = value;
  small.textContent = note;
  tile.append(heading, big, small);
  return tile;
};

const handleLoop = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = $('.error', form);
  const resultEl = $('#loop-result');

  const { value: n, error } = validateN(form.elements.n.value);
  if (error) {
    resultEl.replaceChildren();
    showError(errorEl, error);
    return;
  }
  clearError(errorEl);
  const average = averageFor(n);
  resultEl.replaceChildren(
    makeTile('Factorial (WHILE loop)', factorialWhile(n).toString(), `${n}!`),
    makeTile('Sum (DO...WHILE loop)', decimal.format(sumDoWhile(n)), `1 + 2 + ... + ${n}`),
    makeTile('Average (FOR loop)', average === null ? 'Undefined' : decimal.format(average), n === 0 ? 'No numbers to average' : `Sum divided by ${n}`),
  );
};

/* ---------- 5. PAYROLL ---------- */
// The list of employees lives in this array. The table is redrawn from it.
let employees = [];

// Logic functions (pure: they return new arrays instead of changing the old one)
const calcPay = ({ days, rate, deduction }) => {
  const gross = round2(days * rate);
  return { gross, net: round2(gross - deduction) };
};
const addEmployee = (list, entry) => [...list, { ...entry, ...calcPay(entry) }];
const removeLine = (list, line) => list.filter((_, index) => index !== line - 1);

// Reads and validates the four inputs. Returns { entry } or { error }.
const validateEmployee = ({ employeeName, days, rate, deduction }) => {
  const name = employeeName.value.trim();
  if (name === '') return { error: 'Employee Name is required.' };

  const fields = [['Days Worked', days], ['Daily Rate', rate], ['Deduction Amount', deduction]];
  const parsed = fields.map(([label, input]) => parseNumber(input.value, label));
  const problem = parsed.find(({ error }) => error);
  if (problem) return { error: problem.error };

  const [d, r, ded] = parsed.map(({ value }) => value);
  if (d < 0 || r < 0 || ded < 0) return { error: 'Days Worked, Daily Rate and Deduction Amount cannot be negative.' };
  if (d > 366) return { error: 'Days Worked cannot be more than 366.' };
  if (ded > d * r) return { error: 'Deduction Amount cannot be more than the Gross Pay.' };
  return { entry: { name, days: d, rate: r, deduction: ded } };
};

// UI: redraw the table. textContent keeps names safe from HTML injection.
const renderPayroll = () => {
  const body = $('#payroll-table tbody');
  body.replaceChildren();

  if (employees.length === 0) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.className = 'empty';
    cell.textContent = 'No employees yet. Add one above.';
    return;
  }

  employees.forEach(({ name, days, rate, gross, deduction, net }, index) => {
    const cells = [
      ['No.', index + 1, 'num'],           // the line number is the position in the array
      ['Employee Name', name, 'name'],
      ['Days Worked', decimal.format(days), 'num'],
      ['Daily Rate', peso.format(rate), 'num'],
      ['Gross Pay', peso.format(gross), 'num'],
      ['Deduction Amount', peso.format(deduction), 'num'],
      ['Net Pay', peso.format(net), 'num'],
    ];
    const row = body.insertRow();
    cells.forEach(([label, text, cls]) => {
      const cell = row.insertCell();
      cell.dataset.label = label;
      cell.className = cls;
      cell.textContent = text;
    });
  });
};

const setStatus = (message) => { $('#payroll-status').textContent = message; };
const countText = () => `${employees.length} ${employees.length === 1 ? 'employee' : 'employees'} listed.`;

const handleAddEmployee = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = $('#payroll-error');

  const { entry, error } = validateEmployee(form.elements);
  if (error) { showError(errorEl, error); return; }

  clearError(errorEl);
  employees = addEmployee(employees, entry);
  renderPayroll();
  setStatus(`Added ${entry.name}. ${countText()}`);
  form.reset();
  form.elements.employeeName.focus();
};

const handleDeleteEmployee = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = $('#delete-error');

  if (employees.length === 0) { showError(errorEl, 'There are no employees to delete.'); return; }
  const { value: line, error } = parseNumber(form.elements.line.value, 'Line number');
  if (error) { showError(errorEl, error); return; }
  if (!Number.isInteger(line)) { showError(errorEl, 'Line number must be a whole number.'); return; }
  if (line < 1 || line > employees.length) { showError(errorEl, `Line number must be between 1 and ${employees.length}.`); return; }

  clearError(errorEl);
  const removed = employees[line - 1]?.name;
  employees = removeLine(employees, line);
  renderPayroll(); // numbers are rebuilt from array positions, so lines re-number automatically
  setStatus(`Deleted line ${line} (${removed}). ${countText()}`);
  form.reset();
};

/* ---------- 7. NAVIGATION: menu highlight + search bar ---------- */
// Marks the menu link (and the matching tool shortcut) for the page or section on screen.
const markActive = (key) => {
  $$('[data-nav]').forEach((link) => {
    const isCurrent = link.dataset.nav === key;
    if (isCurrent) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
  });
};

// On the main page, Home and About Me share one file, so the highlight follows the scroll.
const setupScrollSpy = () => {
  const page = document.body.dataset.page;
  markActive(page);
  if (page !== 'home' || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => entries.forEach(({ isIntersecting, target }) => { if (isIntersecting) markActive(target.id); }),
    { rootMargin: '-30% 0px -60% 0px' },
  );
  ['home', 'about'].forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
};

// Search bar: type part of a page name (or pick one from the list) and press Enter.
const handleJump = (event) => {
  event.preventDefault();
  const input = $('#jump-input');
  const errorEl = $('#jump-error');
  const query = input.value.trim().toLowerCase();
  if (query === '') { clearError(errorEl); return; }

  const match = $$('.nav a').find((link) => link.textContent.trim().toLowerCase().includes(query));
  if (!match) {
    showError(errorEl, 'No page matches that. Try Conversion, Income Tax, Looping, Payroll or About Me.');
    return;
  }
  clearError(errorEl);
  window.location.href = match.getAttribute('href');
};

/* ---------- 8. START-UP ---------- */
// Each page only has some of the tools, so every hookup checks that its form exists.
const on = (selector, handler) => { const el = $(selector); if (el) el.addEventListener('submit', handler); };

const init = () => {
  $$('.converter').forEach((form) => form.addEventListener('submit', handleConvert));
  on('#tax-form', handleTax);
  on('#loop-form', handleLoop);
  on('#payroll-form', handleAddEmployee);
  on('#delete-form', handleDeleteEmployee);
  if ($('#result-modal')) setupModal();
  setupScrollSpy();
  on('#jump-form', handleJump);
  // Picking an item from the suggestion list fires an input event with no typing type
  $('#jump-input').addEventListener('input', (event) => {
    if (!event.inputType || event.inputType === 'insertReplacementText') $('#jump-form').requestSubmit();
  });
  if ($('#payroll-table')) { renderPayroll(); setStatus(countText()); }
};

if (typeof document !== 'undefined') init();

// Lets a test script import the logic functions (ignored in the browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runConversion, computeTax, validateIncome, factorialWhile, sumDoWhile, averageFor, validateN, addEmployee, removeLine, validateEmployee, parseNumber };
}
