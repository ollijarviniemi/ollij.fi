/**
 * Data Generating Process DSL Core - todennakoisyysmallit
 *
 * PURPOSE: Define the data generating process for probability modeling levels.
 * Unlike todennakoisyystehdas which defines hypothesis spaces, this DSL defines
 * the ACTUAL data generating process - there's one true distribution.
 *
 * DSL SYNTAX:
 *
 *   // Define sack contents (links to placed sacks by label)
 *   sack("A", {red: 7, blue: 3});              // finite sack
 *   sack("B", {red: 0.7, blue: 0.3}, "infinite"); // infinite sack (proportions)
 *
 *   // Define arms (auto-generates IDs, links by variable name)
 *   const arm1 = arm();
 *   const arm2 = arm();
 *
 *   // Define sampling schedule
 *   schedule({
 *     arm1: [0, 1, 2, 3, 4],
 *     arm2: [5, 6, 7, 8, 9]
 *   });
 *   // Or use linear() for many balls: linear(count, start, delay)
 *   schedule({
 *     arm1: linear(100, 0, 1)  // [0, 1, 2, ..., 99]
 *   });
 *
 *   // Define the question
 *   question("How many balls end up in sack C?");
 *   predict("C", "total");  // target observation point label, what to predict
 *   // OR for distribution over all observation points:
 *   predict("dist");        // which observation point will the ball end up in?
 *
 *   // Define simplified buckets for betting UI (optional - auto-generated if not specified)
 *   // Simplified format: integers for exact values, 2-element arrays for ranges
 *   buckets([0, 1, 2, [3, 4], [5, 10]]);
 *   // Use "inf" for unbounded upper range (displays as "3+" in UI):
 *   buckets([0, 1, 2, [3, "inf"]]);
 *   // Legacy format still supported:
 *   // buckets([{label: "0-1", min: 0, max: 1}, {label: "2-3", min: 2, max: 3}]);
 *
 *   // Set Monte Carlo sample count for distribution computation
 *   montecarlo(1000);
 *
 *   // Optional: show fine-grained distribution below betting UI after submit
 *   display_finegrained(0, 10);  // Shows P(count=k) for k from 0 to 10
 *
 * PREDICTION TYPES (what to predict):
 *
 *   1. "dist" - Distribution over observation points (single-arg form)
 *      predict("dist");
 *      Which observation point will the ball end up in?
 *      Distribution: {A: p1, B: p2, C: p3, ...}
 *      Observation points labeled A, B, C... sorted left-to-right by x-coordinate.
 *
 *   2. "reaches" - Binary probability (two-arg form)
 *      predict("A", "reaches");
 *      P(at least one ball reaches the target)
 *      Distribution: {yes: p, no: 1-p}
 *
 *   3. "total" - Distribution over count (two-arg form)
 *      predict("A", "total");
 *      How many balls end up at the target?
 *      Distribution: {0: p0, 1: p1, 2: p2, ...}
 *
 *   4. "red", "blue", etc. - Distribution over color count (two-arg form)
 *      predict("A", "red");
 *      How many balls of this color end up at the target?
 *      Distribution: {0: p0, 1: p1, 2: p2, ...}
 *
 *   5. "ratio:red" - Distribution over proportion (two-arg form)
 *      predict("A", "ratio:red");
 *      What proportion of balls at target are red?
 *      Distribution: {0.0: p1, 0.2: p2, ...} (discretized)
 */

class DGPEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.sackDefinitions = {};  // label -> {contents, mode}
    this.armDefinitions = {};   // varName -> {id}
    this.samplingSchedule = null;
    this.questionText = '';
    this.prediction = null;     // {target, what}
    this.bucketConfig = null;   // [{label, min, max}, ...] for betting UI
    this.nextArmId = 1;
    this.monteCarloSamples = null;  // MC sample count (required)
    this.showFullDist = false;  // show fine-grained distribution below betting UI (legacy)
    this.fineGrainedDisplay = null;  // {min, max} for fine-grained distribution chart
    this.disableBranching = false;  // skip branching animation for high ball counts
    this.errors = [];
  }

  /**
   * Execute DGP script
   * Returns: {sacks, arms, schedule, question, prediction, errors}
   */
  execute(scriptText) {
    this.reset();

    try {
      const context = this.createContext();
      const wrappedScript = this.wrapScript(scriptText);

      // Execute script
      const func = new Function(...Object.keys(context), wrappedScript);
      func(...Object.values(context));

      // Validate result
      this.validate();

      // Build flat schedule
      if (this.samplingSchedule) {
        this.samplingSchedule = this.buildFlatSchedule(this.samplingSchedule);
      }

    } catch (error) {
      this.errors.push({
        message: error.message,
        line: this.extractLineNumber(error)
      });
    }

    return {
      sacks: this.sackDefinitions,
      arms: this.armDefinitions,
      schedule: this.samplingSchedule,
      questionText: this.questionText,
      prediction: this.prediction,
      buckets: this.bucketConfig,
      ballCount: this.samplingSchedule ? this.samplingSchedule.length : 0,
      monteCarloSamples: this.monteCarloSamples,
      showFullDistribution: this.showFullDist,
      fineGrainedDisplay: this.fineGrainedDisplay,
      disableBranching: this.disableBranching,
      errors: this.errors
    };
  }

  /**
   * Create execution context for the DSL
   */
  createContext() {
    const self = this;

    return {
      // sack(label, contents, mode)
      sack: function(label, contents, mode = 'finite') {
        if (typeof label !== 'string') {
          throw new Error('sack() first argument must be a label string');
        }
        if (!contents || typeof contents !== 'object') {
          throw new Error('sack() second argument must be a contents object like {red: 7, blue: 3}');
        }
        if (mode !== 'finite' && mode !== 'infinite') {
          throw new Error('sack() mode must be "finite" or "infinite"');
        }

        self.sackDefinitions[label] = {
          label: label,
          contents: contents,
          mode: mode
        };
      },

      // arm() - returns arm object
      arm: function() {
        const id = `arm${self.nextArmId++}`;
        return {
          __type: 'arm',
          __id: id,
          __varName: null
        };
      },

      // __captureArm - internal, captures variable name
      __captureArm: function(varName, armObj) {
        if (!armObj || armObj.__type !== 'arm') {
          throw new Error(`Variable ${varName} must be assigned an arm() call`);
        }
        armObj.__varName = varName;
        self.armDefinitions[varName] = {
          id: armObj.__id,
          varName: varName
        };
        return armObj;
      },

      // schedule({arm1: [times], arm2: [times]})
      schedule: function(scheduleObj) {
        if (!scheduleObj || typeof scheduleObj !== 'object') {
          throw new Error('schedule() requires an object like {arm1: [0, 1, 2], arm2: [3, 4, 5]}');
        }
        self.samplingSchedule = scheduleObj;
      },

      // question(text)
      question: function(text) {
        if (typeof text !== 'string') {
          throw new Error('question() requires a string');
        }
        self.questionText = text;
      },

      // predict(target, what) or predict("dist") for distribution mode
      predict: function(targetOrType, what) {
        if (typeof targetOrType !== 'string') {
          throw new Error('predict() first argument must be a string');
        }

        // Single-argument form: predict("dist") or predict("reaches")
        if (what === undefined) {
          if (targetOrType === 'dist') {
            // Distribution over all observation points
            self.prediction = {
              target: null,
              what: 'dist'
            };
          } else if (targetOrType === 'reaches') {
            throw new Error('predict("reaches") requires a target. Use predict("A", "reaches") instead.');
          } else {
            throw new Error(`predict("${targetOrType}") is not valid. For distribution mode use predict("dist"). Otherwise use predict(target, what).`);
          }
        } else {
          // Two-argument form: predict(target, what)
          if (typeof what !== 'string') {
            throw new Error('predict() second argument must specify what to predict ("total", "reaches", etc.)');
          }
          self.prediction = {
            target: targetOrType,
            what: what
          };
        }
      },

      // montecarlo(n) - set number of MC samples for distribution computation
      montecarlo: function(n) {
        if (typeof n !== 'number' || n < 1 || !Number.isInteger(n)) {
          throw new Error('montecarlo() requires a positive integer');
        }
        self.monteCarloSamples = n;
      },

      // buckets([...]) - define buckets for betting UI
      // Accepts: integers (exact value), 2-element arrays [min, max], or legacy {label, min, max} objects
      buckets: function(bucketArray) {
        if (!Array.isArray(bucketArray)) {
          throw new Error('buckets() requires an array of bucket definitions');
        }

        // Parse and validate each bucket
        const parsed = [];
        for (let i = 0; i < bucketArray.length; i++) {
          const item = bucketArray[i];
          let bucket;

          if (typeof item === 'number') {
            // Single integer: exact value
            if (!Number.isInteger(item) || item < 0) {
              throw new Error(`Bucket ${i}: integer values must be non-negative integers`);
            }
            bucket = {label: String(item), min: item, max: item};
          } else if (Array.isArray(item)) {
            // Range: [min, max] or [min, inf] for unbounded
            if (item.length !== 2) {
              throw new Error(`Bucket ${i}: range arrays must have exactly 2 elements [min, max]`);
            }
            let [minVal, maxVal] = item;

            // Handle "inf" or "Infinity" string as Infinity (case-insensitive)
            if (typeof maxVal === 'string') {
              const lower = maxVal.toLowerCase();
              if (lower === 'inf' || lower === 'infinity') {
                maxVal = Infinity;
              }
            } else if (maxVal === Infinity) {
              // Already Infinity, keep it
            }

            if (typeof minVal !== 'number') {
              throw new Error(`Bucket ${i}: min value must be a number`);
            }
            if (typeof maxVal !== 'number') {
              throw new Error(`Bucket ${i}: max value must be a number or "inf"`);
            }
            if (minVal > maxVal) {
              throw new Error(`Bucket ${i}: min (${minVal}) cannot be greater than max (${maxVal})`);
            }

            // Format label: "3+" for infinity, "3-5" for bounded range
            const label = (maxVal === Infinity) ? `${minVal}+` : `${minVal}-${maxVal}`;
            bucket = {label: label, min: minVal, max: maxVal};
          } else if (typeof item === 'object' && item !== null) {
            // Legacy object format: {label, min, max}
            if (typeof item.label !== 'string') {
              throw new Error(`Bucket ${i} must have a string label`);
            }
            if (typeof item.min !== 'number') {
              throw new Error(`Bucket ${i} must have a numeric min value`);
            }
            if (typeof item.max !== 'number' && item.max !== Infinity) {
              throw new Error(`Bucket ${i} must have a numeric max value (use Infinity for unbounded)`);
            }
            if (item.min > item.max) {
              throw new Error(`Bucket ${i}: min (${item.min}) cannot be greater than max (${item.max})`);
            }
            bucket = item;
          } else {
            throw new Error(`Bucket ${i}: must be an integer, [min, max] array, or {label, min, max} object`);
          }

          parsed.push(bucket);
        }

        self.bucketConfig = parsed;
      },

      // showFullDistribution(bool) - whether to show fine-grained distribution below betting UI (legacy)
      showFullDistribution: function(show) {
        if (typeof show !== 'boolean') {
          throw new Error('showFullDistribution() requires a boolean');
        }
        self.showFullDist = show;
      },

      // display_finegrained(min, max) - show fine-grained distribution chart after submit
      // x-axis spans values from min to max, showing P(count=k) for each k
      display_finegrained: function(minVal, maxVal) {
        if (typeof minVal !== 'number' || typeof maxVal !== 'number') {
          throw new Error('display_finegrained() requires two numeric arguments (min, max)');
        }
        if (!Number.isInteger(minVal) || !Number.isInteger(maxVal)) {
          throw new Error('display_finegrained() arguments must be integers');
        }
        if (minVal > maxVal) {
          throw new Error(`display_finegrained(): min (${minVal}) cannot be greater than max (${maxVal})`);
        }
        self.fineGrainedDisplay = {min: minVal, max: maxVal};
      },

      // disable_branching() - skip the branching animation (for high ball counts)
      disable_branching: function() {
        self.disableBranching = true;
      },

      // linear(count, start, delay) - generate array of times: [start, start+delay, start+2*delay, ...]
      // Usage in schedule: arm1: linear(100, 0, 1) generates [0, 1, 2, ..., 99]
      linear: function(count, start = 0, delay = 1) {
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
          throw new Error('linear() first argument (count) must be a positive integer');
        }
        if (typeof start !== 'number') {
          throw new Error('linear() second argument (start) must be a number');
        }
        if (typeof delay !== 'number' || delay <= 0) {
          throw new Error('linear() third argument (delay) must be a positive number');
        }
        const times = [];
        for (let i = 0; i < count; i++) {
          times.push(start + i * delay);
        }
        return times;
      }
    };
  }

  /**
   * Wrap script to capture arm variable assignments
   */
  wrapScript(scriptText) {
    let wrapped = scriptText;

    // Replace "const varName = arm()" with captured version
    wrapped = wrapped.replace(
      /const\s+(\w+)\s*=\s*arm\(\);?/g,
      "const $1 = __captureArm('$1', arm());"
    );

    return wrapped;
  }

  /**
   * Build flat schedule array from object format
   */
  buildFlatSchedule(scheduleObj) {
    const flatSchedule = [];

    for (const [armRef, times] of Object.entries(scheduleObj)) {
      // armRef should be a variable name in armDefinitions
      if (!this.armDefinitions[armRef]) {
        throw new Error(`Unknown arm "${armRef}" in schedule. Define it first with: const ${armRef} = arm();`);
      }

      const armId = this.armDefinitions[armRef].id;

      if (!Array.isArray(times)) {
        throw new Error(`Schedule for ${armRef} must be an array of times`);
      }

      for (const time of times) {
        if (typeof time !== 'number') {
          throw new Error(`Schedule times must be numbers, got ${typeof time}`);
        }
        flatSchedule.push({
          armId: armId,
          armVarName: armRef,
          time: time
        });
      }
    }

    // Sort by time
    flatSchedule.sort((a, b) => a.time - b.time);
    return flatSchedule;
  }

  /**
   * Validate the DGP definition
   */
  validate() {
    // Must have at least one sack
    if (Object.keys(this.sackDefinitions).length === 0) {
      this.errors.push({message: 'No sacks defined. Use sack("A", {red: 7, blue: 3}) to define sack contents.'});
    }

    // Must have a schedule if arms are defined
    if (Object.keys(this.armDefinitions).length > 0 && !this.samplingSchedule) {
      this.errors.push({message: 'Arms defined but no schedule. Use schedule({arm1: [0, 1, 2]}) to define sampling times.'});
    }

    // Must have a prediction target
    if (!this.prediction) {
      this.errors.push({message: 'No prediction target. Use predict("C", "total") to specify what the player predicts.'});
    }

    // Must have montecarlo() specified
    if (this.monteCarloSamples === null) {
      this.errors.push({message: 'No Monte Carlo sample count. Use montecarlo(1000) to specify simulation count.'});
    }
  }

  /**
   * Extract line number from error stack
   */
  extractLineNumber(error) {
    const match = error.stack?.match(/:(\d+):/);
    return match ? parseInt(match[1]) : null;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.DGPEngine = DGPEngine;
}
