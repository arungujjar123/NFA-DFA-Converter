/* ================================================================
   script.js — NFA → DFA Converter
   Complete implementation of Subset Construction Algorithm
   with visualization, step-by-step animation, and string testing.
   ================================================================ */

// ==================== GLOBAL STATE ====================

/** @type {Object|null} Parsed NFA object */
let currentNFA = null;

/** @type {Object|null} Converted DFA object */
let currentDFA = null;

/** @type {Array} Array of conversion step objects */
let conversionSteps = [];

/** @type {number} Current step index for step-by-step view */
let currentStepIndex = -1;

/** @type {boolean} Whether all steps are visible */
let showAllSteps = false;

/** @type {Object|null} vis.js Network instance */
let networkInstance = null;

/** @type {string} Which graph is displayed: 'nfa' or 'dfa' */
let activeGraph = 'nfa';


// ==================== DOM REFERENCES ====================

const DOM = {
  // Inputs
  inputStates:      document.getElementById('input-states'),
  inputAlphabets:   document.getElementById('input-alphabets'),
  inputStart:       document.getElementById('input-start'),
  inputFinals:      document.getElementById('input-finals'),
  inputTransitions: document.getElementById('input-transitions'),

  // Buttons
  btnConvert:       document.getElementById('btn-convert'),
  btnExample:       document.getElementById('btn-example'),
  btnClear:         document.getElementById('btn-clear'),
  btnPrevStep:      document.getElementById('btn-prev-step'),
  btnNextStep:      document.getElementById('btn-next-step'),
  btnShowAllSteps:  document.getElementById('btn-show-all-steps'),
  btnShowNFAGraph:  document.getElementById('btn-show-nfa-graph'),
  btnShowDFAGraph:  document.getElementById('btn-show-dfa-graph'),
  btnTestString:    document.getElementById('btn-test-string'),
  toggleAlgoBtn:    document.getElementById('toggle-algo-btn'),

  // Sections
  stepsSection:     document.getElementById('steps-section'),
  resultSection:    document.getElementById('result-section'),
  graphSection:     document.getElementById('graph-section'),
  testSection:      document.getElementById('test-section'),

  // Containers
  stepsContainer:   document.getElementById('steps-container'),
  stepCounter:      document.getElementById('step-counter'),
  resultMeta:       document.getElementById('result-meta'),
  dfaTableWrapper:  document.getElementById('dfa-table-wrapper'),
  graphContainer:   document.getElementById('graph-container'),
  inputTestString:  document.getElementById('input-test-string'),
  testResult:       document.getElementById('test-result'),
  testTrace:        document.getElementById('test-trace'),
  errorBox:         document.getElementById('error-box'),
  algoBody:         document.getElementById('algo-body'),
};


// ==================== UTILITY FUNCTIONS ====================

/**
 * Creates a canonical string key for a set of states.
 * Sorts them and joins with comma.
 * @param {Set<string>|Array<string>} stateSet
 * @returns {string}
 */
function setKey(stateSet) {
  const arr = Array.from(stateSet).sort();
  return arr.join(',');
}

/**
 * Formats a state set for display (e.g., "{q0, q1}").
 * @param {string} key - Comma-separated key
 * @returns {string}
 */
function formatStateSet(key) {
  if (!key || key === '') return '∅';
  const parts = key.split(',');
  return '{' + parts.join(', ') + '}';
}

/**
 * Shows an error message in the error box.
 * @param {string} msg
 */
function showError(msg) {
  DOM.errorBox.textContent = '⚠ ' + msg;
  DOM.errorBox.classList.remove('hidden');
}

/**
 * Hides the error box.
 */
function hideError() {
  DOM.errorBox.classList.add('hidden');
  DOM.errorBox.textContent = '';
}

/**
 * Reveals a section if hidden.
 * @param {HTMLElement} el
 */
function showSection(el) {
  el.classList.remove('hidden');
}

/**
 * Hides a section.
 * @param {HTMLElement} el
 */
function hideSection(el) {
  el.classList.add('hidden');
}


// ==================== NFA PARSING ====================

/**
 * Parses user input and returns a validated NFA object.
 * @returns {Object} NFA with states, alphabets, transitions, startState, finalStates
 * @throws {Error} On invalid input
 */
function parseNFA() {
  // Parse states
  const statesRaw = DOM.inputStates.value.trim();
  if (!statesRaw) throw new Error('Please enter at least one state.');
  const states = statesRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (states.length === 0) throw new Error('No valid states provided.');

  // Check for duplicate states
  const stateSet = new Set(states);
  if (stateSet.size !== states.length) throw new Error('Duplicate states detected. Each state must be unique.');

  // Parse alphabets
  const alphaRaw = DOM.inputAlphabets.value.trim();
  if (!alphaRaw) throw new Error('Please enter at least one alphabet symbol.');
  const alphabets = alphaRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (alphabets.length === 0) throw new Error('No valid alphabet symbols provided.');

  // Validate no epsilon in alphabets
  for (const a of alphabets) {
    if (a === 'eps' || a === 'ε' || a === 'epsilon') {
      throw new Error('Do not include epsilon (ε) in the alphabets. Epsilon transitions are separate.');
    }
  }

  // Parse start state
  const startState = DOM.inputStart.value.trim();
  if (!startState) throw new Error('Please specify a start state.');
  if (!stateSet.has(startState)) throw new Error(`Start state "${startState}" is not in the states list.`);

  // Parse final states
  const finalsRaw = DOM.inputFinals.value.trim();
  if (!finalsRaw) throw new Error('Please enter at least one final state.');
  const finalStates = finalsRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const f of finalStates) {
    if (!stateSet.has(f)) throw new Error(`Final state "${f}" is not in the states list.`);
  }

  // Parse transitions
  // Each transition: "fromState, symbol, toState"
  // symbol can be an alphabet symbol, 'eps', or 'ε'
  const transRaw = DOM.inputTransitions.value.trim();
  if (!transRaw) throw new Error('Please enter at least one transition.');

  const lines = transRaw.split('\n').map(l => l.trim()).filter(Boolean);

  // transitions map: { fromState: { symbol: Set<toState> } }
  // 'eps' is used internally for epsilon
  const transitions = {};
  const alphaSet = new Set(alphabets);

  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length !== 3) {
      throw new Error(`Invalid transition format: "${line}". Expected "fromState, symbol, toState".`);
    }

    let [from, symbol, to] = parts;

    if (!stateSet.has(from)) throw new Error(`Transition source "${from}" is not in the states list.`);
    if (!stateSet.has(to)) throw new Error(`Transition destination "${to}" is not in the states list.`);

    // Normalize epsilon
    if (symbol === 'ε' || symbol === 'epsilon') symbol = 'eps';

    if (symbol !== 'eps' && !alphaSet.has(symbol)) {
      throw new Error(`Symbol "${symbol}" in transition "${line}" is not in the alphabet list.`);
    }

    if (!transitions[from]) transitions[from] = {};
    if (!transitions[from][symbol]) transitions[from][symbol] = new Set();
    transitions[from][symbol].add(to);
  }

  return {
    states,
    alphabets,
    transitions,
    startState,
    finalStates: new Set(finalStates),
  };
}


// ==================== CORE ALGORITHMS ====================

/**
 * Computes the epsilon-closure of a single state.
 * Returns all states reachable from `state` using only ε-transitions.
 * @param {string} state
 * @param {Object} transitions - NFA transitions map
 * @returns {Set<string>}
 */
function epsilonClosure(state, transitions) {
  const closure = new Set();
  const stack = [state];

  while (stack.length > 0) {
    const current = stack.pop();
    if (closure.has(current)) continue;
    closure.add(current);

    // Follow epsilon transitions
    if (transitions[current] && transitions[current]['eps']) {
      for (const next of transitions[current]['eps']) {
        if (!closure.has(next)) {
          stack.push(next);
        }
      }
    }
  }

  return closure;
}

/**
 * Computes the epsilon-closure of a SET of states.
 * @param {Set<string>} stateSet
 * @param {Object} transitions
 * @returns {Set<string>}
 */
function epsilonClosureSet(stateSet, transitions) {
  const closure = new Set();
  for (const s of stateSet) {
    const sc = epsilonClosure(s, transitions);
    for (const x of sc) closure.add(x);
  }
  return closure;
}

/**
 * Computes the move function: all states reachable from a set of states
 * on a given input symbol (without epsilon transitions).
 * @param {Set<string>} stateSet
 * @param {string} symbol
 * @param {Object} transitions
 * @returns {Set<string>}
 */
function move(stateSet, symbol, transitions) {
  const result = new Set();
  for (const s of stateSet) {
    if (transitions[s] && transitions[s][symbol]) {
      for (const next of transitions[s][symbol]) {
        result.add(next);
      }
    }
  }
  return result;
}

/**
 * Performs the Subset Construction Algorithm to convert NFA to DFA.
 * Records every step for the step-by-step display.
 * @param {Object} nfa - Parsed NFA object
 * @returns {{ dfa: Object, steps: Array }}
 */
function subsetConstruction(nfa) {
  const steps = [];
  const { states, alphabets, transitions, startState, finalStates } = nfa;

  // Step 1: Compute ε-closure of start state
  const startClosure = epsilonClosure(startState, transitions);
  const startKey = setKey(startClosure);

  steps.push({
    title: 'Compute ε-closure of start state',
    body: `ε-closure(<code>${startState}</code>) = <code>${formatStateSet(startKey)}</code>`,
    explanation: `We begin by finding all states reachable from the start state "${startState}" using only ε-transitions. This set becomes the start state of our DFA.`,
  });

  // DFA data structures
  const dfaTransitions = {};   // { stateKey: { symbol: stateKey } }
  const dfaStates = new Map(); // stateKey → Set<nfaStates>
  const dfaFinals = new Set();
  const worklist = [];         // queue of stateKeys to process

  // Initialize with start closure
  dfaStates.set(startKey, startClosure);
  worklist.push(startKey);

  // Check if start state is also a final state
  for (const s of startClosure) {
    if (finalStates.has(s)) {
      dfaFinals.add(startKey);
      break;
    }
  }

  let stepNum = 1;

  // Step 2+: Process each unmarked DFA state
  while (worklist.length > 0) {
    const currentKey = worklist.shift();
    const currentSet = dfaStates.get(currentKey);
    dfaTransitions[currentKey] = {};

    stepNum++;
    steps.push({
      title: `Processing DFA state ${formatStateSet(currentKey)}`,
      body: `Now computing transitions for DFA state <code>${formatStateSet(currentKey)}</code> on each input symbol.`,
      explanation: `We take each unprocessed DFA state and compute where it goes on every input symbol. For each symbol, we find the move set and then its ε-closure.`,
    });

    for (const symbol of alphabets) {
      // Compute move
      const moveResult = move(currentSet, symbol, transitions);
      const moveKey = setKey(moveResult);

      // Compute ε-closure of move result
      const closureResult = epsilonClosureSet(moveResult, transitions);
      const closureKey = setKey(closureResult);

      stepNum++;

      if (closureResult.size === 0) {
        // Dead state / empty set — transition to ∅
        dfaTransitions[currentKey][symbol] = '';
        steps.push({
          title: `δ(${formatStateSet(currentKey)}, ${symbol})`,
          body: `move(<code>${formatStateSet(currentKey)}</code>, <code>${symbol}</code>) = <code>∅</code><br/>` +
                `ε-closure(<code>∅</code>) = <code>∅</code>`,
          explanation: `No states are reachable from ${formatStateSet(currentKey)} on input "${symbol}". This leads to a dead/trap state (∅).`,
        });
      } else {
        dfaTransitions[currentKey][symbol] = closureKey;

        // If this is a new DFA state, add it
        if (!dfaStates.has(closureKey)) {
          dfaStates.set(closureKey, closureResult);
          worklist.push(closureKey);

          // Check if it's a final state
          for (const s of closureResult) {
            if (finalStates.has(s)) {
              dfaFinals.add(closureKey);
              break;
            }
          }
        }

        const isNew = !dfaStates.has(closureKey) || worklist.includes(closureKey);
        steps.push({
          title: `δ(${formatStateSet(currentKey)}, ${symbol})`,
          body: `move(<code>${formatStateSet(currentKey)}</code>, <code>${symbol}</code>) = <code>${formatStateSet(moveKey)}</code><br/>` +
                `ε-closure(<code>${formatStateSet(moveKey)}</code>) = <code>${formatStateSet(closureKey)}</code>`,
          explanation: `From ${formatStateSet(currentKey)} on "${symbol}", we can reach ${formatStateSet(moveKey)}. After following ε-transitions, we get ${formatStateSet(closureKey)}.` +
                       (dfaFinals.has(closureKey) ? ` This is a ✦ final state (contains an NFA accept state).` : ''),
        });
      }
    }
  }

  // Final step: summary
  const allDFAStateKeys = Array.from(dfaStates.keys());
  steps.push({
    title: 'Conversion Complete! ✅',
    body: `DFA has <strong>${allDFAStateKeys.length}</strong> state(s):<br/>` +
          allDFAStateKeys.map(k => `<code>${formatStateSet(k)}</code>`).join(', ') +
          `<br/>Start state: <code>${formatStateSet(startKey)}</code>` +
          `<br/>Final state(s): ` + (dfaFinals.size > 0 ? Array.from(dfaFinals).map(k => `<code>${formatStateSet(k)}</code>`).join(', ') : 'None'),
    explanation: `The subset construction is complete. Every reachable combination of NFA states has been explored. The resulting DFA is deterministic — every state has exactly one transition per input symbol.`,
  });

  const dfa = {
    states: allDFAStateKeys,
    alphabets,
    transitions: dfaTransitions,
    startState: startKey,
    finalStates: dfaFinals,
    stateMapping: dfaStates, // for reference
  };

  return { dfa, steps };
}


// ==================== UI: CONVERSION STEPS ====================

/**
 * Renders conversion steps into the steps container.
 * Supports step-by-step navigation and show-all modes.
 */
function renderSteps() {
  DOM.stepsContainer.innerHTML = '';

  if (showAllSteps) {
    // Show all steps
    conversionSteps.forEach((step, i) => {
      DOM.stepsContainer.appendChild(createStepCard(step, i));
    });
    DOM.stepCounter.textContent = `All ${conversionSteps.length} steps`;
    DOM.btnPrevStep.disabled = true;
    DOM.btnNextStep.disabled = true;
  } else {
    // Show single step
    if (currentStepIndex >= 0 && currentStepIndex < conversionSteps.length) {
      const card = createStepCard(conversionSteps[currentStepIndex], currentStepIndex);
      card.classList.add('highlight');
      DOM.stepsContainer.appendChild(card);
    }
    DOM.stepCounter.textContent = `Step ${currentStepIndex + 1} / ${conversionSteps.length}`;
    DOM.btnPrevStep.disabled = currentStepIndex <= 0;
    DOM.btnNextStep.disabled = currentStepIndex >= conversionSteps.length - 1;
  }
}

/**
 * Creates a step card DOM element.
 * @param {Object} step
 * @param {number} index
 * @returns {HTMLElement}
 */
function createStepCard(step, index) {
  const div = document.createElement('div');
  div.className = 'step-card';
  div.style.animationDelay = `${index * 0.05}s`;

  div.innerHTML = `
    <div class="step-title">
      <span class="badge">${index + 1}</span>
      ${step.title}
    </div>
    <div class="step-body">${step.body}</div>
    ${step.explanation ? `<div class="step-explanation">💡 ${step.explanation}</div>` : ''}
  `;
  return div;
}


// ==================== UI: DFA RESULT TABLE ====================

/**
 * Renders the DFA result: metadata badges and transition table.
 */
function renderDFAResult() {
  if (!currentDFA) return;
  const { states, alphabets, transitions, startState, finalStates } = currentDFA;

  // Meta badges
  DOM.resultMeta.innerHTML = `
    <div class="meta-badge">
      <span class="meta-label">States:</span>
      <span class="meta-value">${states.length}</span>
    </div>
    <div class="meta-badge">
      <span class="meta-label">Start:</span>
      <span class="meta-value">${formatStateSet(startState)}</span>
    </div>
    <div class="meta-badge">
      <span class="meta-label">Finals:</span>
      <span class="meta-value">${Array.from(finalStates).map(formatStateSet).join(', ') || 'None'}</span>
    </div>
  `;

  // Transition Table
  let tableHTML = '<table class="dfa-table"><thead><tr>';
  tableHTML += '<th>DFA State</th>';
  for (const a of alphabets) {
    tableHTML += `<th>δ( , ${a} )</th>`;
  }
  tableHTML += '</tr></thead><tbody>';

  for (const stateKey of states) {
    const isStart = stateKey === startState;
    const isFinal = finalStates.has(stateKey);
    const indicator = (isStart ? '→ ' : '') + (isFinal ? '★ ' : '');
    const indicatorClass = isStart ? 'start-indicator' : (isFinal ? 'final-indicator' : '');

    tableHTML += '<tr>';
    tableHTML += `<td class="state-cell"><span class="${indicatorClass}">${indicator}</span>${formatStateSet(stateKey)}</td>`;

    for (const a of alphabets) {
      const target = transitions[stateKey] ? transitions[stateKey][a] : '';
      tableHTML += `<td>${formatStateSet(target)}</td>`;
    }
    tableHTML += '</tr>';
  }

  tableHTML += '</tbody></table>';
  DOM.dfaTableWrapper.innerHTML = tableHTML;
}


// ==================== GRAPH VISUALIZATION (vis.js) ====================

/**
 * Draws the NFA graph using vis.js
 */
function drawNFAGraph() {
  if (!currentNFA) return;
  const { states, transitions, startState, finalStates } = currentNFA;

  const nodes = states.map(s => ({
    id: s,
    label: s,
    shape: finalStates.has(s) ? 'box' : 'circle',
    borderWidth: finalStates.has(s) ? 3 : 2,
    color: {
      background: s === startState ? '#34d399' : (finalStates.has(s) ? '#fbbf24' : '#6c8aff'),
      border: s === startState ? '#059669' : (finalStates.has(s) ? '#d97706' : '#4f6eea'),
      highlight: { background: '#a78bfa', border: '#7c3aed' },
    },
    font: { color: '#0b0e17', size: 16, face: 'Inter', bold: true },
    shadow: true,
  }));

  // Add invisible "start" node with arrow to start state
  nodes.push({
    id: '__start__',
    label: '',
    shape: 'dot',
    size: 1,
    color: { background: 'transparent', border: 'transparent' },
    fixed: true,
  });

  const edges = [];

  // Start arrow
  edges.push({
    from: '__start__',
    to: startState,
    arrows: 'to',
    color: { color: '#34d399' },
    width: 2,
    label: 'start',
    font: { color: '#34d399', size: 11, face: 'Inter' },
  });

  // Group transitions by (from, to) to combine labels
  const edgeMap = {};
  for (const from in transitions) {
    for (const symbol in transitions[from]) {
      for (const to of transitions[from][symbol]) {
        const key = `${from}__${to}`;
        const displaySymbol = symbol === 'eps' ? 'ε' : symbol;
        if (!edgeMap[key]) edgeMap[key] = { from, to, labels: [] };
        edgeMap[key].labels.push(displaySymbol);
      }
    }
  }

  for (const key in edgeMap) {
    const { from, to, labels } = edgeMap[key];
    edges.push({
      from,
      to,
      label: labels.join(', '),
      arrows: 'to',
      color: { color: '#64748b', hover: '#a78bfa', highlight: '#a78bfa' },
      font: { color: '#e8ecf4', size: 13, face: 'JetBrains Mono', strokeWidth: 3, strokeColor: '#0b0e17' },
      width: 2,
      smooth: from === to ? { type: 'curvedCW', roundness: 0.4 } : { type: 'dynamic' },
    });
  }

  renderGraph(nodes, edges);
}

/**
 * Draws the DFA graph using vis.js
 */
function drawDFAGraph() {
  if (!currentDFA) return;
  const { states, transitions, startState, finalStates, alphabets } = currentDFA;

  const nodes = states.map(key => ({
    id: key,
    label: formatStateSet(key),
    shape: finalStates.has(key) ? 'box' : 'circle',
    borderWidth: finalStates.has(key) ? 3 : 2,
    color: {
      background: key === startState ? '#34d399' : (finalStates.has(key) ? '#fbbf24' : '#6c8aff'),
      border: key === startState ? '#059669' : (finalStates.has(key) ? '#d97706' : '#4f6eea'),
      highlight: { background: '#a78bfa', border: '#7c3aed' },
    },
    font: { color: '#0b0e17', size: 14, face: 'JetBrains Mono', bold: true },
    shadow: true,
  }));

  // Also add dead state if referenced
  const referencedStates = new Set(states);
  for (const from of states) {
    if (transitions[from]) {
      for (const sym of alphabets) {
        const target = transitions[from][sym];
        if (target === '' && !referencedStates.has('')) {
          referencedStates.add('');
          nodes.push({
            id: '',
            label: '∅',
            shape: 'circle',
            borderWidth: 2,
            color: { background: '#475569', border: '#334155' },
            font: { color: '#e8ecf4', size: 14, face: 'Inter' },
            shadow: true,
          });
        }
      }
    }
  }

  // Start arrow
  nodes.push({
    id: '__start__',
    label: '',
    shape: 'dot',
    size: 1,
    color: { background: 'transparent', border: 'transparent' },
    fixed: true,
  });

  const edges = [];
  edges.push({
    from: '__start__',
    to: startState,
    arrows: 'to',
    color: { color: '#34d399' },
    width: 2,
    label: 'start',
    font: { color: '#34d399', size: 11, face: 'Inter' },
  });

  // Group transitions by (from, to)
  const edgeMap = {};
  for (const from of states) {
    if (!transitions[from]) continue;
    for (const symbol of alphabets) {
      const to = transitions[from][symbol];
      if (to === undefined) continue;
      const key = `${from}__${to}`;
      if (!edgeMap[key]) edgeMap[key] = { from, to, labels: [] };
      edgeMap[key].labels.push(symbol);
    }
  }

  for (const key in edgeMap) {
    const { from, to, labels } = edgeMap[key];
    edges.push({
      from,
      to,
      label: labels.join(', '),
      arrows: 'to',
      color: { color: '#64748b', hover: '#a78bfa', highlight: '#a78bfa' },
      font: { color: '#e8ecf4', size: 13, face: 'JetBrains Mono', strokeWidth: 3, strokeColor: '#0b0e17' },
      width: 2,
      smooth: from === to ? { type: 'curvedCW', roundness: 0.4 } : { type: 'dynamic' },
    });
  }

  renderGraph(nodes, edges);
}

/**
 * Renders a graph with vis.js.
 * @param {Array} nodesArray
 * @param {Array} edgesArray
 */
function renderGraph(nodesArray, edgesArray) {
  if (networkInstance) {
    networkInstance.destroy();
    networkInstance = null;
  }

  const data = {
    nodes: new vis.DataSet(nodesArray),
    edges: new vis.DataSet(edgesArray),
  };

  const options = {
    layout: {
      improvedLayout: true,
      hierarchical: false,
    },
    physics: {
      enabled: true,
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -100,
        centralGravity: 0.01,
        springLength: 180,
        springConstant: 0.04,
        damping: 0.4,
      },
      stabilization: { iterations: 200, updateInterval: 20 },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      zoomView: true,
      dragView: true,
    },
    edges: {
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      smooth: { type: 'dynamic' },
    },
    nodes: {
      size: 30,
      shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', size: 10 },
    },
  };

  networkInstance = new vis.Network(DOM.graphContainer, data, options);
}


// ==================== STRING TESTING ====================

/**
 * Tests a string against the converted DFA.
 * Shows step-by-step trace and accept/reject result.
 */
function testString() {
  if (!currentDFA) return;

  const inputStr = DOM.inputTestString.value;
  const { alphabets, transitions, startState, finalStates } = currentDFA;

  // Validate input characters
  const alphaSet = new Set(alphabets);
  for (const ch of inputStr) {
    if (!alphaSet.has(ch)) {
      DOM.testResult.className = 'test-result rejected';
      DOM.testResult.textContent = `❌ Invalid symbol "${ch}" — not in the alphabet {${alphabets.join(', ')}}`;
      DOM.testResult.classList.remove('hidden');
      DOM.testTrace.classList.add('hidden');
      return;
    }
  }

  // Simulate DFA
  let currentState = startState;
  const trace = [{ state: currentState, symbol: null }];

  for (const ch of inputStr) {
    const nextState = transitions[currentState] ? transitions[currentState][ch] : '';
    trace.push({ state: nextState, symbol: ch });
    currentState = nextState;
  }

  const accepted = finalStates.has(currentState);

  // Show result
  DOM.testResult.className = `test-result ${accepted ? 'accepted' : 'rejected'}`;
  DOM.testResult.textContent = accepted
    ? `✅ String "${inputStr}" is ACCEPTED`
    : `❌ String "${inputStr}" is REJECTED`;
  DOM.testResult.classList.remove('hidden');

  // Show trace
  let traceHTML = '';
  trace.forEach((t, i) => {
    const isFinal = finalStates.has(t.state);
    const isDead = t.state === '';
    let stateClass = 'trace-state';
    if (isFinal) stateClass += ' final-state';
    if (isDead) stateClass += ' dead-state';

    if (i > 0) {
      traceHTML += `
        <div class="trace-arrow">
          <span class="trace-symbol">${t.symbol}</span>
          →
        </div>
      `;
    }
    traceHTML += `<span class="${stateClass}" style="animation-delay: ${i * 0.1}s">${isDead ? '∅' : formatStateSet(t.state)}</span>`;
  });

  DOM.testTrace.innerHTML = traceHTML;
  DOM.testTrace.classList.remove('hidden');
}


// ==================== PRELOADED EXAMPLE ====================

/**
 * Loads a sample NFA into the input fields.
 * This NFA has epsilon transitions for a good demonstration.
 */
function loadExample() {
  // Classic example: NFA for (a|b)*abb with epsilon transitions
  DOM.inputStates.value = 'q0, q1, q2, q3';
  DOM.inputAlphabets.value = 'a, b';
  DOM.inputStart.value = 'q0';
  DOM.inputFinals.value = 'q3';
  DOM.inputTransitions.value =
`q0, a, q0
q0, b, q0
q0, a, q1
q1, b, q2
q2, b, q3`;

  hideError();

  // Provide brief flash effect on the form
  DOM.inputStates.style.borderColor = 'var(--accent-green)';
  DOM.inputAlphabets.style.borderColor = 'var(--accent-green)';
  DOM.inputStart.style.borderColor = 'var(--accent-green)';
  DOM.inputFinals.style.borderColor = 'var(--accent-green)';
  DOM.inputTransitions.style.borderColor = 'var(--accent-green)';

  setTimeout(() => {
    DOM.inputStates.style.borderColor = '';
    DOM.inputAlphabets.style.borderColor = '';
    DOM.inputStart.style.borderColor = '';
    DOM.inputFinals.style.borderColor = '';
    DOM.inputTransitions.style.borderColor = '';
  }, 1200);
}


// ==================== CLEAR ====================

/**
 * Resets all inputs, hides result sections, clears state.
 */
function clearAll() {
  DOM.inputStates.value = '';
  DOM.inputAlphabets.value = '';
  DOM.inputStart.value = '';
  DOM.inputFinals.value = '';
  DOM.inputTransitions.value = '';
  DOM.inputTestString.value = '';

  hideError();

  hideSection(DOM.stepsSection);
  hideSection(DOM.resultSection);
  hideSection(DOM.graphSection);
  hideSection(DOM.testSection);

  DOM.stepsContainer.innerHTML = '';
  DOM.resultMeta.innerHTML = '';
  DOM.dfaTableWrapper.innerHTML = '';
  DOM.testResult.classList.add('hidden');
  DOM.testTrace.classList.add('hidden');

  currentNFA = null;
  currentDFA = null;
  conversionSteps = [];
  currentStepIndex = -1;
  showAllSteps = false;

  if (networkInstance) {
    networkInstance.destroy();
    networkInstance = null;
  }
}


// ==================== MAIN CONVERT HANDLER ====================

/**
 * Main conversion handler: parses NFA, runs subset construction,
 * and renders all output sections.
 */
function handleConvert() {
  hideError();

  try {
    // Parse and validate NFA
    currentNFA = parseNFA();

    // Run subset construction
    const result = subsetConstruction(currentNFA);
    currentDFA = result.dfa;
    conversionSteps = result.steps;

    // Reset step navigation
    currentStepIndex = 0;
    showAllSteps = false;

    // Show all sections
    showSection(DOM.stepsSection);
    showSection(DOM.resultSection);
    showSection(DOM.graphSection);
    showSection(DOM.testSection);

    // Render content
    renderSteps();
    renderDFAResult();

    // Default to NFA graph
    activeGraph = 'nfa';
    DOM.btnShowNFAGraph.classList.add('active');
    DOM.btnShowNFAGraph.classList.remove('btn-outline');
    DOM.btnShowNFAGraph.classList.add('btn-secondary');
    DOM.btnShowDFAGraph.classList.remove('active');
    DOM.btnShowDFAGraph.classList.remove('btn-secondary');
    DOM.btnShowDFAGraph.classList.add('btn-outline');
    drawNFAGraph();

    // Clear test results
    DOM.testResult.classList.add('hidden');
    DOM.testTrace.classList.add('hidden');
    DOM.inputTestString.value = '';

    // Smooth scroll to steps
    DOM.stepsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    showError(error.message);
  }
}


// ==================== EVENT LISTENERS ====================

// Convert button
DOM.btnConvert.addEventListener('click', handleConvert);

// Load Example
DOM.btnExample.addEventListener('click', loadExample);

// Clear
DOM.btnClear.addEventListener('click', clearAll);

// Step navigation
DOM.btnPrevStep.addEventListener('click', () => {
  if (currentStepIndex > 0) {
    showAllSteps = false;
    currentStepIndex--;
    renderSteps();
  }
});

DOM.btnNextStep.addEventListener('click', () => {
  if (currentStepIndex < conversionSteps.length - 1) {
    showAllSteps = false;
    currentStepIndex++;
    renderSteps();
  }
});

DOM.btnShowAllSteps.addEventListener('click', () => {
  showAllSteps = !showAllSteps;
  DOM.btnShowAllSteps.textContent = showAllSteps ? 'Step-by-Step' : 'Show All';
  renderSteps();
});

// Graph toggle
DOM.btnShowNFAGraph.addEventListener('click', () => {
  if (activeGraph === 'nfa') return;
  activeGraph = 'nfa';
  DOM.btnShowNFAGraph.classList.add('active');
  DOM.btnShowNFAGraph.classList.remove('btn-outline');
  DOM.btnShowNFAGraph.classList.add('btn-secondary');
  DOM.btnShowDFAGraph.classList.remove('active');
  DOM.btnShowDFAGraph.classList.remove('btn-secondary');
  DOM.btnShowDFAGraph.classList.add('btn-outline');
  drawNFAGraph();
});

DOM.btnShowDFAGraph.addEventListener('click', () => {
  if (activeGraph === 'dfa') return;
  activeGraph = 'dfa';
  DOM.btnShowDFAGraph.classList.add('active');
  DOM.btnShowDFAGraph.classList.remove('btn-outline');
  DOM.btnShowDFAGraph.classList.add('btn-secondary');
  DOM.btnShowNFAGraph.classList.remove('active');
  DOM.btnShowNFAGraph.classList.remove('btn-secondary');
  DOM.btnShowNFAGraph.classList.add('btn-outline');
  drawDFAGraph();
});

// Test string
DOM.btnTestString.addEventListener('click', testString);

// Allow Enter key on test input
DOM.inputTestString.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') testString();
});

// Algorithm explanation toggle
DOM.toggleAlgoBtn.addEventListener('click', () => {
  DOM.algoBody.classList.toggle('collapsed');
  DOM.toggleAlgoBtn.textContent = DOM.algoBody.classList.contains('collapsed') ? '▶' : '▼';
});

// Keyboard shortcut: Ctrl+Enter to convert
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleConvert();
  }
});


// ==================== SAMPLE TEST CASES (console) ====================

/*
 * SAMPLE TEST CASES
 * =================
 *
 * Test Case 1: NFA for (a|b)*abb (no ε-transitions)
 *   States: q0, q1, q2, q3
 *   Alphabets: a, b
 *   Start: q0
 *   Finals: q3
 *   Transitions:
 *     q0, a, q0
 *     q0, b, q0
 *     q0, a, q1
 *     q1, b, q2
 *     q2, b, q3
 *   Expected DFA: 4–5 states, recognizes strings ending in "abb"
 *   Test strings: "abb" → Accept, "aabb" → Accept, "ab" → Reject, "babb" → Accept
 *
 * Test Case 2: NFA with ε-transitions
 *   States: q0, q1, q2
 *   Alphabets: a, b
 *   Start: q0
 *   Finals: q2
 *   Transitions:
 *     q0, eps, q1
 *     q1, a, q1
 *     q1, b, q2
 *   Expected DFA: 2–3 states
 *   Test strings: "b" → Accept, "ab" → Accept, "aab" → Accept, "a" → Reject
 *
 * Test Case 3: Simple NFA (a*)
 *   States: q0, q1
 *   Alphabets: a
 *   Start: q0
 *   Finals: q1
 *   Transitions:
 *     q0, a, q0
 *     q0, a, q1
 *   Test strings: "a" → Accept, "aaa" → Accept, "" → Reject (empty)
 */
