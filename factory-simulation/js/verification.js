/**
 * Level Verification System
 * Compares Monte Carlo simulation with DSL model solutions
 */

let isRunning = false;
let shouldStop = false;
let errors = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  LevelRegistry.init();
  updateLevelCount();
});

function updateLevelCount() {
  const groups = LevelRegistry.loadGroups();
  let total = 0;
  for (const groupId of ['group1', 'group2', 'group3', 'group4', 'group5', 'group6']) {
    total += (groups[groupId] || []).length;
  }
  document.getElementById('levelCount').textContent = `${total} levels in Groups 1-6`;
}

function stopVerification() {
  shouldStop = true;
}

async function runVerification() {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;
  errors = [];

  const numSimulations = parseInt(document.getElementById('numSimulations').value) || 1000;

  // UI state
  document.getElementById('runBtn').disabled = true;
  document.getElementById('stopBtn').style.display = 'inline-block';
  document.getElementById('progressSection').classList.add('active');
  document.getElementById('resultsSection').style.display = 'block';
  document.getElementById('resultsBody').innerHTML = '';
  document.getElementById('summarySection').style.display = 'none';
  document.getElementById('errorLog').style.display = 'none';

  const groups = LevelRegistry.loadGroups();
  const allLevels = LevelRegistry.getAllLevels();
  const results = [];

  // Collect all levels from groups 1-6
  const levelTasks = [];
  for (let g = 1; g <= 6; g++) {
    const groupKey = `group${g}`;
    const levelIds = groups[groupKey] || [];
    for (let pos = 0; pos < levelIds.length; pos++) {
      const levelId = levelIds[pos];
      const level = allLevels.find(l => l.meta.id === levelId);
      if (level) {
        levelTasks.push({
          groupNum: g,
          position: pos + 1,
          level: level,
          levelId: levelId
        });
      }
    }
  }

  const totalTasks = levelTasks.length;
  let completed = 0;

  // Add group headers
  let currentGroup = 0;
  const resultsBody = document.getElementById('resultsBody');

  for (const task of levelTasks) {
    if (shouldStop) break;

    // Add group header if new group
    if (task.groupNum !== currentGroup) {
      currentGroup = task.groupNum;
      const headerRow = document.createElement('tr');
      headerRow.className = 'group-header';
      headerRow.innerHTML = `<td colspan="6">Group ${currentGroup}</td>`;
      resultsBody.appendChild(headerRow);
    }

    // Update progress
    completed++;
    const pct = Math.round((completed / totalTasks) * 100);
    document.getElementById('progressText').textContent =
      `Processing ${task.groupNum}-${task.position}: ${task.level.meta.title} (${completed}/${totalTasks})`;
    document.getElementById('progressFill').style.width = `${pct}%`;

    // Run verification for this level
    const result = await verifyLevel(task.level, numSimulations);
    result.groupNum = task.groupNum;
    result.position = task.position;
    results.push(result);

    // Add result row
    addResultRow(resultsBody, task, result);

    // Yield to UI
    await new Promise(r => setTimeout(r, 10));
  }

  // Show summary
  showSummary(results);

  // Show errors if any
  if (errors.length > 0) {
    document.getElementById('errorLog').style.display = 'block';
    document.getElementById('errorLogContent').textContent = errors.join('\n\n');
  }

  // Reset UI
  document.getElementById('runBtn').disabled = false;
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('progressSection').classList.remove('active');
  isRunning = false;
}

async function verifyLevel(level, numSimulations) {
  const result = {
    title: level.meta.title,
    mode: level.dgpResult?.prediction?.what || 'unknown',
    hasModel: !!level.intendedModel,
    mcDistribution: null,
    dslDistribution: null,
    storedDistribution: level.correctDistribution || {},
    mcDiscrepancy: null,
    dslDiscrepancy: null,
    mcVsDsl: null,
    error: null
  };

  try {
    // 1. Run Monte Carlo simulation
    result.mcDistribution = await runMonteCarloSimulation(level, numSimulations);
    result.mcDiscrepancy = computeDiscrepancy(
      result.storedDistribution,
      result.mcDistribution,
      result.mode
    );

    // 2. Run DSL model if available
    if (level.intendedModel && level.intendedModel.trim()) {
      try {
        result.dslDistribution = runDSLModel(level.intendedModel, result.mode);
        result.dslDiscrepancy = computeDiscrepancy(
          result.storedDistribution,
          result.dslDistribution,
          result.mode
        );
        result.mcVsDsl = computeDiscrepancy(
          result.mcDistribution,
          result.dslDistribution,
          result.mode
        );
      } catch (e) {
        result.dslError = e.message;
        errors.push(`[${level.meta.title}] DSL Error: ${e.message}`);
      }
    }
  } catch (e) {
    result.error = e.message;
    errors.push(`[${level.meta.title}] MC Error: ${e.message}`);
  }

  return result;
}

async function runMonteCarloSimulation(level, numSamples) {
  const outcomes = {};

  if (!level.dgpResult || !level.dgpResult.prediction) {
    throw new Error('No DGP result or prediction defined');
  }

  const { sacks, schedule, prediction } = level.dgpResult;

  // Build observation points for "dist" mode
  let targetComponent = null;
  let observationPoints = null;

  if (prediction.what === 'dist') {
    observationPoints = level.components
      .filter(c => c.type === 'observation')
      .sort((a, b) => a.position.x - b.position.x)
      .map((comp, index) => ({
        id: comp.id,
        index: index,
        label: String.fromCharCode(65 + index)
      }));
  } else {
    const targetLabel = prediction.target;
    targetComponent = level.components.find(c =>
      c.type === 'observation' &&
      (c.params?.label === targetLabel || c.id === targetLabel)
    );
    if (!targetComponent) {
      throw new Error(`Target "${targetLabel}" not found`);
    }
  }

  // Build simulation level
  const simLevel = buildSimulationLevel(level, sacks, schedule);

  // Run MC
  for (let i = 0; i < numSamples; i++) {
    const seed = SeedManager.getMonteCarloSeed(i);
    const outcome = runSingleSimulation(
      simLevel,
      targetComponent?.id,
      prediction,
      seed,
      observationPoints
    );
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
  }

  // Convert to probabilities
  const distribution = {};
  for (const [outcome, count] of Object.entries(outcomes)) {
    distribution[outcome] = count / numSamples;
  }

  return distribution;
}

function buildSimulationLevel(level, dgpSacks, dgpSchedule) {
  // Deep copy components and apply DGP sack contents
  const components = level.components.map(comp => {
    const copy = {
      id: comp.id,
      type: comp.type,
      position: { x: comp.position.x, y: comp.position.y },
      params: { ...comp.params }
    };

    if (comp.type === 'sack' && dgpSacks && dgpSacks[comp.params?.label]) {
      copy.params.contents = { ...dgpSacks[comp.params.label].contents };
    }

    return copy;
  });

  const connections = (level.connections || []).map(conn => ({
    from: conn.from,
    to: conn.to
  }));

  // Convert DGP schedule to simulation format
  const samplingSchedule = [];
  if (dgpSchedule && level.dgpResult?.arms) {
    for (const entry of dgpSchedule) {
      const armVarName = entry.armVarName;
      const armDef = level.dgpResult.arms[armVarName];
      if (armDef) {
        const armComponents = components.filter(c => c.type === 'arm');
        let armComp = armComponents.find(c => c.params?.label === armVarName);
        if (!armComp) {
          const armIndex = parseInt(armVarName.replace(/\D/g, '')) - 1;
          if (!isNaN(armIndex) && armIndex >= 0 && armIndex < armComponents.length) {
            armComp = armComponents[armIndex];
          }
        }
        if (armComp) {
          samplingSchedule.push({ armId: armComp.id, time: entry.time });
        }
      }
    }
  }

  return {
    grid: level.grid || { width: 10, height: 8 },
    components,
    connections,
    samplingSchedule
  };
}

function runSingleSimulation(level, targetId, prediction, seed, observationPoints) {
  const config = {
    ballProductionInterval: 1000,
    ballSpeed: 1.0,
    ballsToSpawn: level.samplingSchedule.length,
    seed: seed
  };

  const simulation = new Simulation(level, config);
  simulation.resolveReferences();

  const maxTicks = 10000;
  const tickDelta = 100;

  for (let tick = 0; tick < maxTicks && simulation.running; tick++) {
    simulation.tick(tickDelta);
  }

  // Handle "dist" mode
  if (prediction.what === 'dist') {
    if (!observationPoints || observationPoints.length === 0) {
      return 'unknown';
    }
    for (const obs of observationPoints) {
      const obsComp = simulation.getComponent(obs.id);
      if (obsComp) {
        const ballCount = (obsComp.observedBalls?.length || 0) + (obsComp.observations?.length || 0);
        if (ballCount > 0) {
          return obs.label;
        }
      }
    }
    return 'none';
  }

  const targetComp = simulation.getComponent(targetId);
  if (!targetComp) return 0;

  if (prediction.what === 'reaches') {
    const count = (targetComp.observedBalls?.length || 0) + (targetComp.observations?.length || 0);
    return count > 0 ? 'yes' : 'no';
  } else if (prediction.what === 'total') {
    if (targetComp.observedBalls) return targetComp.observedBalls.length;
    if (targetComp.observations) return targetComp.observations.length;
    return 0;
  } else {
    const color = prediction.what;
    if (targetComp.observations) {
      return targetComp.observations.filter(obs => obs.color === color).length;
    }
    if (targetComp.observedBalls) {
      return targetComp.observedBalls.filter(ball => ball.color === color).length;
    }
    return 0;
  }
}

function runDSLModel(modelScript, predictionMode) {
  // Parse and execute the DSL script
  const ast = parseDSL(modelScript);

  RandomSource.resetIdCounter();
  globalBFSBudget.reset();

  const interpreter = new DSLInterpreter();
  const result = interpreter.execute(ast);

  // Check for execution errors
  if (result.errors && result.errors.length > 0) {
    throw new Error(`DSL error: ${result.errors[0].message}`);
  }

  // Handle different return value types
  let distribution = {};

  if (result.returnValue && result.returnValue.pmf) {
    // It's a Distribution object with PMF
    for (const [value, prob] of result.returnValue.pmf.entries()) {
      let key = value;
      // Normalize keys for reaches mode
      if (predictionMode === 'reaches') {
        if (typeof value === 'boolean') {
          key = value ? 'yes' : 'no';
        } else if (value === 1 || value === '1') {
          key = 'yes';
        } else if (value === 0 || value === '0') {
          key = 'no';
        }
      } else if (typeof value === 'boolean') {
        key = value ? 'yes' : 'no';
      }
      distribution[String(key)] = (distribution[String(key)] || 0) + prob;
    }
  } else if (result.returnValue !== undefined && result.returnValue !== null) {
    // Check if returnValue is a number (constant probability for reaches mode)
    const rv = result.returnValue;
    if (typeof rv === 'number' && predictionMode === 'reaches') {
      // Interpret as P(yes) for reaches mode
      distribution = { 'yes': rv, 'no': 1 - rv };
    } else if (typeof rv === 'object' && !rv.pmf) {
      // Maybe it's already a plain object distribution
      for (const [k, v] of Object.entries(rv)) {
        distribution[String(k)] = v;
      }
    } else {
      throw new Error(`Unexpected return type: ${typeof rv}, value: ${JSON.stringify(rv)}`);
    }
  } else {
    // No return value - check if there's a computed distribution in variables
    // Try to find __return__ or any probabilistic result
    if (result.distributions && result.distributions['__return__']) {
      const dist = result.distributions['__return__'];
      if (dist.pmf) {
        for (const [value, prob] of dist.pmf.entries()) {
          let key = value;
          if (typeof value === 'boolean') {
            key = value ? 'yes' : 'no';
          }
          distribution[String(key)] = prob;
        }
      }
    } else {
      throw new Error('Model script did not return a probability distribution');
    }
  }

  // Validate distribution
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (Object.keys(distribution).length === 0) {
    throw new Error('Model returned empty distribution');
  }
  if (Math.abs(total - 1) > 0.01) {
    console.warn(`Distribution sums to ${total}, not 1`);
  }

  return distribution;
}

function computeDiscrepancy(dist1, dist2, mode) {
  if (!dist1 || !dist2) return null;

  // Normalize keys based on mode
  const normalize = (d, mode) => {
    const result = {};
    for (let [k, v] of Object.entries(d)) {
      // Normalize reaches mode keys
      if (mode === 'reaches') {
        if (k === '1' || k === 1 || k === 'true' || k === true) {
          k = 'yes';
        } else if (k === '0' || k === 0 || k === 'false' || k === false) {
          k = 'no';
        }
      }
      // Normalize dist mode keys: convert one-hot arrays to letters
      // e.g., "1,0,0" -> "A", "0,1,0" -> "B", "0,0,1" -> "C"
      if (mode === 'dist' && typeof k === 'string' && k.includes(',')) {
        const parts = k.split(',').map(x => parseInt(x.trim()));
        const oneIndex = parts.indexOf(1);
        if (oneIndex !== -1 && parts.filter(x => x === 1).length === 1) {
          k = String.fromCharCode(65 + oneIndex);  // A, B, C, ...
        }
      }
      const key = String(k);
      result[key] = (result[key] || 0) + v;
    }
    return result;
  };

  const d1 = normalize(dist1, mode);
  const d2 = normalize(dist2, mode);

  if (mode === 'reaches') {
    // For reaches mode, just compare P(yes)
    const p1 = d1['yes'] || 0;
    const p2 = d2['yes'] || 0;
    return Math.abs(p1 - p2);
  }

  // For dist and total modes, find max discrepancy across all buckets
  const allKeys = new Set([...Object.keys(d1), ...Object.keys(d2)]);
  let maxDiff = 0;

  for (const key of allKeys) {
    const p1 = d1[key] || 0;
    const p2 = d2[key] || 0;
    maxDiff = Math.max(maxDiff, Math.abs(p1 - p2));
  }

  return maxDiff;
}

function addResultRow(tbody, task, result) {
  const row = document.createElement('tr');

  const discClass = (val) => {
    if (val === null) return '';
    if (val < 0.01) return 'good';
    if (val < 0.05) return 'warning';
    return 'bad';
  };

  const formatDisc = (val) => {
    if (val === null) return '-';
    return (val * 100).toFixed(2) + '%';
  };

  const formatDist = (dist) => {
    if (!dist) return 'null';
    const entries = Object.entries(dist).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return entries.map(([k, v]) => `${k}:${(v * 100).toFixed(1)}%`).join(', ');
  };

  // Build details string showing actual distributions
  let details = result.error || result.dslError || '';
  if (!details && result.hasModel) {
    details = `Stored: {${formatDist(result.storedDistribution)}} | DSL: {${formatDist(result.dslDistribution)}}`;
  }

  row.innerHTML = `
    <td>${task.groupNum}-${task.position}: ${result.title}</td>
    <td>${result.mode}</td>
    <td class="discrepancy ${discClass(result.mcDiscrepancy)}">${formatDisc(result.mcDiscrepancy)}</td>
    <td class="discrepancy ${result.hasModel ? discClass(result.dslDiscrepancy) : 'no-model'}">
      ${result.hasModel ? formatDisc(result.dslDiscrepancy) : 'No model'}
    </td>
    <td class="discrepancy ${discClass(result.mcVsDsl)}">${formatDisc(result.mcVsDsl)}</td>
    <td style="font-size: 11px; max-width: 400px; overflow: hidden; text-overflow: ellipsis;">${details}</td>
  `;

  tbody.appendChild(row);
}

function showSummary(results) {
  const totalLevels = results.length;
  const levelsWithModel = results.filter(r => r.hasModel).length;

  const mcDiscrepancies = results.filter(r => r.mcDiscrepancy !== null).map(r => r.mcDiscrepancy);
  const dslDiscrepancies = results.filter(r => r.dslDiscrepancy !== null).map(r => r.dslDiscrepancy);
  const mcVsDslDiffs = results.filter(r => r.mcVsDsl !== null).map(r => r.mcVsDsl);

  const avgMC = mcDiscrepancies.length > 0
    ? mcDiscrepancies.reduce((a, b) => a + b, 0) / mcDiscrepancies.length
    : 0;

  const avgDSL = dslDiscrepancies.length > 0
    ? dslDiscrepancies.reduce((a, b) => a + b, 0) / dslDiscrepancies.length
    : 0;

  const maxDiff = mcVsDslDiffs.length > 0
    ? Math.max(...mcVsDslDiffs)
    : 0;

  document.getElementById('totalLevels').textContent = totalLevels;
  document.getElementById('levelsWithModel').textContent = levelsWithModel;
  document.getElementById('avgMCDisc').textContent = (avgMC * 100).toFixed(2) + '%';
  document.getElementById('avgDSLDisc').textContent = (avgDSL * 100).toFixed(2) + '%';
  document.getElementById('maxDisc').textContent = (maxDiff * 100).toFixed(2) + '%';

  document.getElementById('summarySection').style.display = 'block';
}
